import { useMemo, useState } from "react";
import type { Course, TranscriptEntry } from "../types";
import { byTerm, cumulativeAverage, extremes, graded, totals } from "../lib/transcript";
import { gradeColor, pct } from "../lib/format";
import { uid } from "../lib/storage";

interface Props {
  transcript: TranscriptEntry[];
  courses: Course[];
  onChange: (entries: TranscriptEntry[]) => void;
  /** Opens the transcript import modal (wired once that feature lands). */
  onImport?: () => void;
  /** Opens the pull-from-in-progress-courses picker (wired once that lands). */
  onAddFromCourses?: () => void;
}

export function TranscriptScreen({ transcript, onChange, onImport, onAddFromCourses }: Props) {
  const [editing, setEditing] = useState(false);

  const groups = useMemo(() => byTerm(transcript), [transcript]);
  const gradedEntries = useMemo(() => graded(transcript), [transcript]);

  const update = (id: string, p: Partial<TranscriptEntry>) =>
    onChange(transcript.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const remove = (id: string) => onChange(transcript.filter((e) => e.id !== id));
  const add = () =>
    onChange([
      ...transcript,
      { id: uid(), name: "New course", term: "", source: "manual" },
    ]);
  const addAndEdit = () => {
    add();
    setEditing(true);
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="label text-accent">Performance</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Transcript</h1>
          <p className="mt-2 max-w-lg text-ink-soft">
            Your completed courses and how they add up — cumulative average, term by term.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onAddFromCourses && (
            <button onClick={onAddFromCourses} className="btn-ghost">
              Add finished course
            </button>
          )}
          {onImport && (
            <button onClick={onImport} className="btn-accent">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Import transcript
            </button>
          )}
        </div>
      </div>

      {transcript.length === 0 ? (
        <EmptyState onAdd={addAndEdit} onImport={onImport} />
      ) : (
        <>
          {gradedEntries.length > 0 && <PerformanceSummary transcript={transcript} />}

          <div className="mt-6 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Courses</h2>
            <button onClick={() => setEditing((e) => !e)} className={editing ? "btn-primary" : "btn-ghost"}>
              {editing ? "Done" : "Edit"}
            </button>
          </div>

          {editing ? (
            <EditList transcript={transcript} onUpdate={update} onRemove={remove} onAdd={add} />
          ) : (
            <div className="mt-3 space-y-5">
              {groups.map((g) => (
                <div key={g.term} className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line/70 bg-paper-sunk/40 px-4 py-2.5">
                    <span className="font-display text-base font-semibold">{g.term || "—"}</span>
                    <span className="text-xs tabular-nums text-ink-soft">
                      {g.average != null ? `avg ${pct(g.average, 1)}` : "—"} · {g.count} course
                      {g.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="divide-y divide-line/60">
                    {g.entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                        {e.code && (
                          <span className="shrink-0 rounded bg-paper-sunk px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-soft">
                            {e.code}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                        {e.credits != null && (
                          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                            {e.credits} cr
                          </span>
                        )}
                        <span
                          className="w-14 shrink-0 text-right font-display text-sm font-semibold tabular-nums"
                          style={{ color: e.grade != null ? gradeColor(e.grade) : undefined }}
                        >
                          {e.grade != null ? pct(e.grade, 0) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PerformanceSummary({ transcript }: { transcript: TranscriptEntry[] }) {
  const cum = cumulativeAverage(transcript);
  const t = totals(transcript);
  const { best, worst } = extremes(transcript);

  return (
    <div className="card mt-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-5">
      <div>
        <p className="label">Cumulative average</p>
        <p
          className="mt-0.5 font-display text-4xl font-semibold tabular-nums"
          style={{ color: cum != null ? gradeColor(cum) : undefined }}
        >
          {pct(cum, 1)}
        </p>
      </div>
      <div>
        <p className="label">Courses</p>
        <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{t.gradedCount}</p>
      </div>
      <div>
        <p className="label">Credits</p>
        <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
          {Number(t.credits.toFixed(2))}
        </p>
      </div>
      {best && worst && (
        <div className="ml-auto text-right text-xs text-ink-soft">
          <p>
            Best: <span className="font-semibold">{best.name}</span> · {pct(best.grade, 0)}
          </p>
          {worst.id !== best.id && (
            <p className="mt-0.5">
              Lowest: <span className="font-semibold">{worst.name}</span> · {pct(worst.grade, 0)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EditList({
  transcript,
  onUpdate,
  onRemove,
  onAdd,
}: {
  transcript: TranscriptEntry[];
  onUpdate: (id: string, p: Partial<TranscriptEntry>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const num = (v: string): number | undefined => {
    if (v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  return (
    <div className="card mt-3 p-4">
      <ul className="divide-y divide-line/60">
        {transcript.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
            <input
              value={e.code ?? ""}
              onChange={(ev) => onUpdate(e.id, { code: ev.target.value || undefined })}
              placeholder="CODE"
              className="w-24 rounded border border-line bg-paper-card px-2 py-1 text-xs font-semibold uppercase tracking-wide outline-none focus:border-accent"
            />
            <input
              value={e.name}
              onChange={(ev) => onUpdate(e.id, { name: ev.target.value })}
              placeholder="Course name"
              className="min-w-40 flex-1 rounded border border-line bg-paper-card px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <input
              value={e.term}
              onChange={(ev) => onUpdate(e.id, { term: ev.target.value })}
              placeholder="Term"
              className="w-28 rounded border border-line bg-paper-card px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <input
              type="number"
              min={0}
              step={0.25}
              value={e.credits ?? ""}
              onChange={(ev) => onUpdate(e.id, { credits: num(ev.target.value) })}
              placeholder="cr"
              className="w-16 rounded border border-line bg-paper-card px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-accent"
            />
            <input
              type="number"
              min={0}
              value={e.grade ?? ""}
              onChange={(ev) => onUpdate(e.id, { grade: num(ev.target.value) })}
              placeholder="%"
              className="w-16 rounded border border-line bg-paper-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-accent"
            />
            <button
              onClick={() => onRemove(e.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-faint hover:text-bad"
              title="Remove course"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add course
      </button>
    </div>
  );
}

function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport?: () => void }) {
  return (
    <div className="card mt-9 flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-wash text-accent">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold">No transcript yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-ink-soft">
          Add your completed courses to see how your performance adds up — cumulative average, term
          by term.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={onAdd} className="btn-accent">
          Add a course
        </button>
        {onImport && (
          <button onClick={onImport} className="btn-ghost">
            Import transcript
          </button>
        )}
      </div>
    </div>
  );
}
