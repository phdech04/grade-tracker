import { useMemo } from "react";
import type { Component, Course, DropRule, Item } from "../types";
import { gradeSummary, requiredAverage, totalWeight } from "../lib/grades";
import { gradeColor, letterGrade, pct } from "../lib/format";
import { uid } from "../lib/storage";
import { GradeRing } from "./GradeRing";

interface Props {
  course: Course;
  onChange: (c: Course) => void;
  onDelete: () => void;
  onBack: () => void;
}

export function CourseDetail({ course, onChange, onDelete, onBack }: Props) {
  const summary = useMemo(() => gradeSummary(course), [course]);
  const tw = useMemo(() => totalWeight(course), [course]);

  const patch = (p: Partial<Course>) => onChange({ ...course, ...p });

  const updateComponent = (id: string, p: Partial<Component>) =>
    patch({ components: course.components.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const removeComponent = (id: string) =>
    patch({ components: course.components.filter((c) => c.id !== id) });

  const addComponent = () =>
    patch({
      components: [
        ...course.components,
        {
          id: uid(),
          name: "New component",
          weight: 0,
          items: [{ id: uid(), label: "Item 1", max: course.scoreMode === "points" ? 10 : 100 }],
        },
      ],
    });

  return (
    <div>
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-accent">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All courses
      </button>

      {/* Course header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={course.code ?? ""}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="CODE"
              className="w-28 rounded bg-paper-sunk px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-soft outline-none focus:ring-2 focus:ring-accent/20"
            />
            <input
              value={course.term ?? ""}
              onChange={(e) => patch({ term: e.target.value })}
              placeholder="Term"
              className="w-32 bg-transparent text-xs text-ink-faint outline-none"
            />
          </div>
          <input
            value={course.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="mt-1 w-full bg-transparent font-display text-3xl font-semibold tracking-tight outline-none placeholder:text-ink-faint"
            placeholder="Course name"
          />
        </div>
        <button onClick={onDelete} className="btn-ghost text-bad hover:bg-bad/5">
          Delete
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: components */}
        <div className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Grading scheme</h2>
            <ModePill course={course} onChange={patch} />
          </div>

          <div className="space-y-4">
            {course.components.map((c) => (
              <ComponentCard
                key={c.id}
                component={c}
                scoreMode={course.scoreMode}
                onChange={(p) => updateComponent(c.id, p)}
                onRemove={() => removeComponent(c.id)}
              />
            ))}
          </div>

          <button onClick={addComponent} className="btn-ghost mt-4 w-full border-dashed">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add component
          </button>

          {course.scoreMode === "percentage" && course.components.length > 0 && (
            <p className={`mt-3 text-xs ${Math.abs(tw - 100) < 0.5 ? "text-ink-faint" : "text-warn"}`}>
              Weights total {tw.toFixed(tw % 1 ? 1 : 0)}%
              {Math.abs(tw - 100) >= 0.5 && " — should add up to 100%"}
            </p>
          )}

          <Hurdles course={course} onChange={patch} />
        </div>

        {/* Right: live summary */}
        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <StandingCard course={course} summary={summary} />
          <TargetCard course={course} onChange={patch} />
        </aside>
      </div>
    </div>
  );
}

function ModePill({ course, onChange }: { course: Course; onChange: (p: Partial<Course>) => void }) {
  return (
    <div className="flex rounded-full bg-paper-sunk p-0.5 text-xs font-semibold">
      {(["percentage", "points"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange({ scoreMode: m })}
          className={`rounded-full px-3 py-1 transition ${
            course.scoreMode === m ? "bg-paper-card text-ink shadow-sm" : "text-ink-faint"
          }`}
        >
          {m === "percentage" ? "% weighted" : "points"}
        </button>
      ))}
    </div>
  );
}

function StandingCard({ course, summary }: { course: Course; summary: ReturnType<typeof gradeSummary> }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        <GradeRing value={summary.current} track={summary.weightCompleted} />
        <div className="flex-1">
          <p className="label">Standing so far</p>
          <p className="font-display text-sm text-ink-soft">
            {summary.anyGraded
              ? `${letterGrade(summary.current)} on ${pct(summary.weightCompleted, 0)} of the grade`
              : "No marks entered yet"}
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <Row label="Projected" value={pct(summary.projected, 1)} accent />
            <Row label="If you ace the rest" value={pct(summary.bestCase, 1)} />
            <Row label="If you bomb the rest" value={pct(summary.worstCase, 1)} />
          </div>
        </div>
      </div>
      <p className="mt-3 border-t border-line/70 pt-2 text-[11px] leading-relaxed text-ink-faint">
        The faint ring shows how much of the grade is locked in. Projection assumes remaining work
        matches your current average.
      </p>
      {course.scoreMode === "points" && (
        <p className="mt-1 text-[11px] text-ink-faint">Points mode: grade = earned ÷ total points.</p>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className={`font-display font-semibold tabular-nums ${accent ? "text-accent" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function TargetCard({ course, onChange }: { course: Course; onChange: (p: Partial<Course>) => void }) {
  const target = course.targetGrade;
  const result = target != null ? requiredAverage(course, target) : null;

  return (
    <div className="card p-5">
      <p className="label">Target solver</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm text-ink-soft">I want to finish with</span>
        <input
          type="number"
          value={target ?? ""}
          onChange={(e) =>
            onChange({ targetGrade: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          placeholder="85"
          className="field w-20 text-center font-display font-semibold tabular-nums"
        />
        <span className="text-sm text-ink-soft">%</span>
      </div>

      {result && target != null && (
        <div className="mt-4">
          {result.status === "complete" && (
            <p className="text-sm text-ink-soft">All work is graded — nothing left to compute.</p>
          )}
          {result.status === "guaranteed" && (
            <p className="rounded-lg bg-good/10 px-3 py-2.5 text-sm font-medium text-good">
              Already locked in — you've hit {target}% no matter what.
            </p>
          )}
          {result.status === "impossible" && (
            <p className="rounded-lg bg-bad/10 px-3 py-2.5 text-sm font-medium text-bad">
              Out of reach — even 100% on the remaining {pct(result.remainingWeight, 0)} falls short.
            </p>
          )}
          {result.status === "achievable" && (
            <div className="rounded-lg bg-accent-wash px-3 py-3">
              <p className="text-sm text-ink-soft">You need an average of</p>
              <p className="font-display text-3xl font-semibold tabular-nums text-accent">
                {pct(result.required, 1)}
              </p>
              <p className="text-sm text-ink-soft">
                on the remaining {pct(result.remainingWeight, 0)} of the grade.
              </p>
            </div>
          )}
        </div>
      )}
      {target == null && (
        <p className="mt-3 text-xs text-ink-faint">
          Enter a goal to see the average you need on what's left.
        </p>
      )}
    </div>
  );
}

function ComponentCard({
  component,
  scoreMode,
  onChange,
  onRemove,
}: {
  component: Component;
  scoreMode: Course["scoreMode"];
  onChange: (p: Partial<Component>) => void;
  onRemove: () => void;
}) {
  const setItem = (id: string, p: Partial<Item>) =>
    onChange({ items: component.items.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  const removeItem = (id: string) =>
    onChange({ items: component.items.filter((it) => it.id !== id) });
  const addItem = () =>
    onChange({
      items: [
        ...component.items,
        {
          id: uid(),
          label: `Item ${component.items.length + 1}`,
          max: component.items[0]?.max ?? (scoreMode === "points" ? 10 : 100),
        },
      ],
    });

  const dropKind = component.drop?.kind ?? "none";
  const dropCount =
    component.drop?.kind === "keepBest"
      ? component.drop.keep
      : component.drop?.kind === "dropLowest"
        ? component.drop.dropLowest
        : 0;

  const setDrop = (kind: string, count: number) => {
    let drop: DropRule | undefined;
    if (kind === "keepBest") drop = { kind: "keepBest", keep: Math.max(1, count || 1) };
    else if (kind === "dropLowest") drop = { kind: "dropLowest", dropLowest: Math.max(1, count || 1) };
    onChange({ drop });
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line/70 bg-paper-sunk/40 px-4 py-2.5">
        <input
          value={component.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 bg-transparent font-display text-base font-semibold outline-none"
        />
        {scoreMode === "percentage" && (
          <label className="flex items-center gap-1 text-sm text-ink-soft">
            <input
              type="number"
              value={component.weight || ""}
              onChange={(e) => onChange({ weight: Number(e.target.value) || 0 })}
              className="w-16 rounded border border-line bg-paper-card px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
            />
            %
          </label>
        )}
        <button onClick={onRemove} className="grid h-7 w-7 place-items-center rounded text-ink-faint hover:bg-bad/10 hover:text-bad" title="Remove component">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {component.needsReview && (
        <div className="flex items-start gap-2 border-b border-warn/20 bg-warn/5 px-4 py-2 text-xs text-warn">
          <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.86l-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.44l-8.5-14.7a2 2 0 0 0-3.4 0z" />
          </svg>
          <span>{component.needsReview} — double-check this.</span>
        </div>
      )}

      <div className="divide-y divide-line/60">
        {component.items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 px-4 py-2">
            <input
              value={it.label}
              onChange={(e) => setItem(it.id, { label: e.target.value })}
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <input
              type="number"
              value={it.score ?? ""}
              onChange={(e) =>
                setItem(it.id, { score: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="—"
              className="w-16 rounded-md border border-line bg-paper-card px-2 py-1 text-right text-sm tabular-nums outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <span className="text-ink-faint">/</span>
            <input
              type="number"
              value={it.max}
              onChange={(e) => setItem(it.id, { max: Number(e.target.value) || 0 })}
              className="w-14 rounded-md border border-transparent bg-paper-sunk/60 px-2 py-1 text-right text-sm tabular-nums text-ink-soft outline-none focus:border-line focus:bg-paper-card"
            />
            <button onClick={() => removeItem(it.id)} className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:text-bad" title="Remove item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 px-4 py-2.5 text-xs text-ink-soft">
        <button onClick={addItem} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add item
        </button>
        <label className="flex items-center gap-1.5">
          <span className="text-ink-faint">Rule</span>
          <select
            value={dropKind}
            onChange={(e) => setDrop(e.target.value, dropCount || 1)}
            className="rounded border border-line bg-paper-card px-1.5 py-1 outline-none focus:border-accent"
          >
            <option value="none">count all</option>
            <option value="keepBest">best N of {component.items.length}</option>
            <option value="dropLowest">drop lowest</option>
          </select>
        </label>
        {dropKind !== "none" && (
          <input
            type="number"
            value={dropCount}
            onChange={(e) => setDrop(dropKind, Number(e.target.value))}
            className="w-14 rounded border border-line bg-paper-card px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
          />
        )}
        <label className="flex items-center gap-1.5" title="Two components sharing a link form a 'whichever is better' pair">
          <span className="text-ink-faint">Link</span>
          <input
            value={component.linkGroupId ?? ""}
            onChange={(e) => onChange({ linkGroupId: e.target.value || undefined })}
            placeholder="—"
            className="w-20 rounded border border-line bg-paper-card px-2 py-1 outline-none placeholder:text-ink-faint focus:border-accent"
          />
        </label>
      </div>
    </div>
  );
}

function Hurdles({ course, onChange }: { course: Course; onChange: (p: Partial<Course>) => void }) {
  if (course.hurdles.length === 0) return null;
  return (
    <div className="card mt-6 p-4">
      <p className="label mb-2">Pass requirements</p>
      <ul className="space-y-1.5">
        {course.hurdles.map((h) => (
          <li key={h.id} className="flex items-start gap-2 text-sm text-ink-soft">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: gradeColor(40) }} />
            <input
              value={h.description}
              onChange={(e) =>
                onChange({
                  hurdles: course.hurdles.map((x) =>
                    x.id === h.id ? { ...x, description: e.target.value } : x,
                  ),
                })
              }
              className="flex-1 bg-transparent outline-none"
            />
            <button
              onClick={() => onChange({ hurdles: course.hurdles.filter((x) => x.id !== h.id) })}
              className="text-ink-faint hover:text-bad"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
