import { useMemo } from "react";
import type { PlanConfig, TranscriptEntry } from "../types";
import { MAJORS } from "../data/majors";
import { CATALOG } from "../data/catalog";
import { buildCatalog, evaluate, type MajorProgress } from "../lib/planner/requirements";
import { LEVELS, pastStudyTerms, takenFromTranscript } from "../lib/planner/backfill";
import { schedule } from "../lib/planner/scheduler";

interface Props {
  transcript: TranscriptEntry[];
  plan: PlanConfig;
  onChangePlan: (plan: PlanConfig) => void;
}

const catalog = buildCatalog(CATALOG);

export function PlanScreen({ transcript, plan, onChangePlan }: Props) {
  const taken = useMemo(() => takenFromTranscript(transcript), [transcript]);
  // Memoize so the (now real) scheduler solve doesn't rerun on unrelated renders.
  const selected = useMemo(() => MAJORS.filter((m) => plan.majorIds.includes(m.id)), [plan.majorIds]);
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
        <>
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

          <TermMap transcript={transcript} taken={taken} majors={selected} />
        </>
      )}
    </div>
  );
}

function TermMap({
  transcript,
  taken,
  majors,
}: {
  transcript: TranscriptEntry[];
  taken: Set<string>;
  majors: typeof MAJORS;
}) {
  const { columns, unplaced } = useMemo(() => {
    const past = pastStudyTerms(transcript);
    const remainingLevels = LEVELS.slice(past.length);
    const sched = schedule({ majors, taken, catalog, levels: remainingLevels });
    const cols = [
      ...past.map((p) => ({ level: p.level, courses: p.courses, future: false })),
      ...sched.terms.map((t) => ({ level: t.level, courses: t.courses, future: true })),
    ];
    return { columns: cols, unplaced: sched.unplaced };
  }, [transcript, taken, majors]);

  return (
    <div className="mt-8">
      <h2 className="font-display text-lg font-semibold">Suggested sequence</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Past terms are from your transcript; upcoming terms are a prerequisite-valid suggestion to
        finish the remaining requirements.
      </p>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {columns.map((c) => (
          <div key={c.level} className="w-40 shrink-0">
            <div
              className={`rounded-t-lg px-3 py-1.5 text-center text-xs font-semibold ${
                c.future ? "bg-accent-wash text-accent" : "bg-paper-sunk text-ink-soft"
              }`}
            >
              {c.level}
              {c.future && " · planned"}
            </div>
            <div className="min-h-24 space-y-1.5 rounded-b-lg border border-line bg-paper-card p-2">
              {c.courses.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-ink-faint">—</p>
              ) : (
                c.courses.map((code) => (
                  <div
                    key={code}
                    className={`truncate rounded px-2 py-1 text-xs ${
                      c.future
                        ? "border border-accent/30 bg-accent-wash/40 text-ink"
                        : "bg-paper-sunk text-ink-soft"
                    }`}
                    title={code}
                  >
                    {code}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {unplaced.length > 0 && (
        <div className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          <span className="font-semibold">Won't fit in {LEVELS.length} terms:</span>{" "}
          {unplaced.join(", ")}. You may need an extra term, or a prerequisite is missing from the
          catalog.
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
