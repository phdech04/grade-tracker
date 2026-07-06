import { useMemo, useState } from "react";
import type { Component, Course } from "../types";
import { gradeSummary, requiredAverage, totalWeight } from "../lib/grades";
import { pct } from "../lib/format";
import { uid } from "../lib/storage";
import { GradeRing } from "./GradeRing";
import { ComponentCard } from "./ComponentCard";

interface Props {
  course: Course;
  onChange: (c: Course) => void;
  onDelete: () => void;
  onBack: () => void;
}

/** Display blocks: standalone components, or a better-of group rendered together. */
type Block =
  | { kind: "single"; component: Component }
  | { kind: "group"; id: string; members: Component[] };

function buildBlocks(components: Component[]): Block[] {
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const c of components) {
    if (!c.linkGroupId) {
      blocks.push({ kind: "single", component: c });
      continue;
    }
    if (seen.has(c.linkGroupId)) continue;
    seen.add(c.linkGroupId);
    const members = components.filter((m) => m.linkGroupId === c.linkGroupId);
    if (members.length === 1) blocks.push({ kind: "single", component: c });
    else blocks.push({ kind: "group", id: c.linkGroupId, members });
  }
  return blocks;
}

export function CourseDetail({ course, onChange, onDelete, onBack }: Props) {
  const [editing, setEditing] = useState(false);
  const summary = useMemo(() => gradeSummary(course), [course]);
  const tw = useMemo(() => totalWeight(course), [course]);
  const showNormalized = Math.abs(tw - 100) >= 0.5;

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
          items: [{ id: uid(), label: "Item 1" }],
        },
      ],
    });

  /** Pair `aId` with `otherId` ("whichever is better"), or unpair when null. */
  const pairBetterOf = (aId: string, otherId: string | null) => {
    const comps = course.components.map((c) => ({ ...c }));
    const dissolve = (gid: string | undefined) => {
      if (!gid) return;
      for (const m of comps) if (m.linkGroupId === gid) delete m.linkGroupId;
    };
    const a = comps.find((c) => c.id === aId);
    if (!a) return;
    dissolve(a.linkGroupId);
    if (otherId) {
      const b = comps.find((c) => c.id === otherId);
      if (b) {
        dissolve(b.linkGroupId);
        const gid = uid();
        a.linkGroupId = gid;
        b.linkGroupId = gid;
      }
    }
    patch({ components: comps });
  };

  const blocks = buildBlocks(course.components);
  const summaryFor = (id: string) => summary.components.find((cs) => cs.component.id === id);

  const renderCard = (c: Component, counting: boolean | null) => {
    const group = c.linkGroupId
      ? course.components.filter((m) => m.linkGroupId === c.linkGroupId)
      : [];
    const pairedWithId =
      group.length === 2 ? (group.find((m) => m.id !== c.id)?.id ?? null) : null;
    return (
      <ComponentCard
        key={c.id}
        component={c}
        editing={editing}
        summary={summaryFor(c.id)}
        showNormalized={showNormalized}
        counting={counting}
        pairOptions={course.components
          .filter((o) => o.id !== c.id)
          .map((o) => ({ id: o.id, name: o.name }))}
        pairedWithId={pairedWithId}
        onChange={(p) => updateComponent(c.id, p)}
        onRemove={() => removeComponent(c.id)}
        onPair={(otherId) => pairBetterOf(c.id, otherId)}
      />
    );
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All courses
      </button>

      {/* Course header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={course.code ?? ""}
                  onChange={(e) => patch({ code: e.target.value || undefined })}
                  placeholder="CODE"
                  className="w-28 rounded bg-paper-sunk px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-soft outline-none focus:ring-2 focus:ring-accent/20"
                />
                <input
                  value={course.term ?? ""}
                  onChange={(e) => patch({ term: e.target.value || undefined })}
                  placeholder="Term"
                  className="w-32 rounded bg-paper-sunk px-2 py-1 text-xs text-ink-soft outline-none focus:ring-2 focus:ring-accent/20"
                />
                <label className="flex items-center gap-1 text-xs text-ink-soft">
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={course.credits ?? ""}
                    onChange={(e) =>
                      patch({
                        credits: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                      })
                    }
                    placeholder="—"
                    className="w-16 rounded bg-paper-sunk px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  credits
                </label>
              </div>
              <input
                value={course.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="mt-1 w-full bg-transparent font-display text-3xl font-semibold tracking-tight outline-none placeholder:text-ink-faint"
                placeholder="Course name"
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {course.code && (
                  <span className="rounded bg-paper-sunk px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {course.code}
                  </span>
                )}
                {course.term && <span className="text-xs text-ink-faint">{course.term}</span>}
                {course.credits != null && (
                  <span className="text-xs text-ink-faint">{course.credits} credits</span>
                )}
              </div>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {course.name}
              </h1>
            </>
          )}
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className={editing ? "btn-primary" : "btn-ghost"}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: components */}
        <div className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Grading scheme</h2>
          </div>

          <div className="space-y-4">
            {blocks.map((b) =>
              b.kind === "single" ? (
                renderCard(b.component, null)
              ) : (
                <div key={b.id} className="overflow-hidden rounded-xl2 border border-accent/25">
                  <div className="bg-accent-wash px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    Whichever is better counts
                  </div>
                  <div className="space-y-px bg-accent/10 [&>.card]:rounded-none [&>.card]:border-0">
                    {b.members.map((m) => {
                      const anyGraded = b.members.some((x) => x.items.some((it) => it.score != null));
                      return renderCard(m, anyGraded ? summary.countingIds.includes(m.id) : null);
                    })}
                  </div>
                </div>
              ),
            )}
          </div>

          {editing && (
            <button onClick={addComponent} className="btn-ghost mt-4 w-full border-dashed">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add component
            </button>
          )}

          {course.components.length > 0 && (
            <p className={`mt-3 text-xs ${showNormalized ? "text-warn" : "text-ink-faint"}`}>
              Weights total {tw.toFixed(tw % 1 ? 1 : 0)}
              {showNormalized
                ? " — not 100, so each share is normalized (shown on the cards)"
                : "%"}
            </p>
          )}

          <Hurdles course={course} editing={editing} onChange={patch} />

          {editing && (
            <div className="mt-8 border-t border-line/70 pt-4">
              <button
                onClick={() => {
                  if (confirm("Delete this course and all its marks?")) onDelete();
                }}
                className="btn-ghost text-bad hover:bg-bad/5"
              >
                Delete this course
              </button>
            </div>
          )}
        </div>

        {/* Right: live summary */}
        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <StandingCard summary={summary} />
          <TargetCard course={course} onChange={patch} />
        </aside>
      </div>
    </div>
  );
}

function StandingCard({ summary }: { summary: ReturnType<typeof gradeSummary> }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        <GradeRing value={summary.current} track={summary.weightCompleted} />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <p className="label">Standing so far</p>
            <span
              className="cursor-help text-ink-faint"
              title="The faint ring shows how much of the grade is locked in. Projection assumes remaining work matches your current average."
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </span>
          </div>
          <p className="font-display text-sm text-ink-soft">
            {summary.anyGraded
              ? `${pct(summary.current, 0)} so far, with ${pct(summary.weightCompleted, 0)} of the grade in`
              : "No marks entered yet"}
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <Row label="Projected" value={pct(summary.projected, 1)} accent />
            <Row label="If you ace the rest" value={pct(summary.bestCase, 1)} />
            <Row label="If you bomb the rest" value={pct(summary.worstCase, 1)} />
          </div>
        </div>
      </div>
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
          onFocus={(e) => e.currentTarget.select()}
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

function Hurdles({
  course,
  editing,
  onChange,
}: {
  course: Course;
  editing: boolean;
  onChange: (p: Partial<Course>) => void;
}) {
  if (course.hurdles.length === 0 && !editing) return null;
  return (
    <div className="card mt-6 p-4">
      <p className="label mb-2">Pass requirements</p>
      <ul className="space-y-1.5">
        {course.hurdles.map((h) => (
          <li key={h.id} className="flex items-start gap-2 text-sm text-ink-soft">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            {editing ? (
              <>
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
              </>
            ) : (
              <span className="flex-1">{h.description}</span>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <button
          onClick={() =>
            onChange({ hurdles: [...course.hurdles, { id: uid(), description: "" }] })
          }
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add requirement
        </button>
      )}
    </div>
  );
}
