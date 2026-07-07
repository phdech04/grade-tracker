import { useMemo } from "react";
import type { PlanConfig, TranscriptEntry } from "../types";
import { MAJORS } from "../data/majors";
import { COURSES } from "../data/courses";
import { buildCatalog, evaluate, type MajorProgress } from "../lib/planner/requirements";
import { takenFromTranscript } from "../lib/planner/backfill";

interface Props {
  transcript: TranscriptEntry[];
  plan: PlanConfig;
  onChangePlan: (plan: PlanConfig) => void;
}

const catalog = buildCatalog(COURSES);

export function PlanScreen({ transcript, plan, onChangePlan }: Props) {
  const taken = useMemo(() => takenFromTranscript(transcript), [transcript]);
  const selected = MAJORS.filter((m) => plan.majorIds.includes(m.id));
  const progresses = useMemo(
    () => selected.map((m) => ({ major: m, progress: evaluate(m, taken, catalog) })),
    [selected, taken],
  );

  const toggle = (id: string) => {
    const has = plan.majorIds.includes(id);
    onChangePlan({ majorIds: has ? plan.majorIds.filter((x) => x !== id) : [...plan.majorIds, id] });
  };

  return (
    <div>
      <div>
        <p className="label text-accent">Degree plan</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Plan your degree</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          Pick your major(s) and Tally maps your progress against the requirements, using the courses
          on your transcript.
        </p>
      </div>

      {/* Major picker */}
      <div className="mt-6 flex flex-wrap gap-2">
        {MAJORS.map((m) => {
          const on = plan.majorIds.includes(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                on
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-paper-card text-ink-soft hover:border-accent/50"
              }`}
            >
              {on ? "✓ " : ""}
              {m.name}
            </button>
          );
        })}
      </div>

      {plan.majorIds.length > 1 && (
        <p className="mt-2 text-xs text-ink-faint">
          Double major — a course can count toward both plans (double-counting).
        </p>
      )}

      {selected.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center text-ink-soft">
          Select a major above to see your progress.
        </div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {progresses.map(({ major, progress }) => (
            <ProgressCard
              key={major.id}
              name={major.name}
              progress={progress}
              minMath={major.minMathUnits}
              minNonMath={major.minNonMathUnits}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressCard({
  name,
  progress,
  minMath,
  minNonMath,
}: {
  name: string;
  progress: MajorProgress;
  minMath: number;
  minNonMath: number;
}) {
  const groupsMet = progress.groups.filter((g) => g.satisfied).length;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{name}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            progress.complete ? "bg-good/10 text-good" : "bg-accent-wash text-accent"
          }`}
        >
          {progress.complete ? "Complete" : `${groupsMet}/${progress.groups.length} groups`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <UnitBar label="Math units" have={progress.mathUnits} need={minMath} ok={progress.mathUnitsOk} />
        <UnitBar label="Non-math units" have={progress.nonMathUnits} need={minNonMath} ok={progress.nonMathUnitsOk} />
      </div>

      <ul className="mt-4 space-y-1.5">
        {progress.groups.map((g, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 shrink-0 ${g.satisfied ? "text-good" : "text-ink-faint"}`}>
              {g.satisfied ? "✓" : "○"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={g.satisfied ? "text-ink-soft" : ""}>{g.label}</span>
              {!g.satisfied && g.remaining.length > 0 && (
                <span className="text-ink-faint"> — take {g.remaining.join(", ")}</span>
              )}
              {!g.satisfied && g.remaining.length === 0 && g.need - g.have > 0 && (
                <span className="text-ink-faint"> — {g.need - g.have} more</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnitBar({ label, have, need, ok }: { label: string; have: number; need: number; ok: boolean }) {
  const pctW = Math.min(100, (have / need) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-faint">{label}</span>
        <span className={`tabular-nums ${ok ? "text-good" : "text-ink-soft"}`}>
          {Number(have.toFixed(2))}/{need}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-sunk">
        <div
          className={`h-full rounded-full ${ok ? "bg-good" : "bg-accent"}`}
          style={{ width: `${pctW}%` }}
        />
      </div>
    </div>
  );
}
