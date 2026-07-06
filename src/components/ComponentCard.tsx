import type { Component, DropRule, Item } from "../types";
import type { ComponentSummary } from "../lib/grades";
import { uid } from "../lib/storage";

interface ComponentCardProps {
  component: Component;
  editing: boolean;
  summary: ComponentSummary | undefined;
  showNormalized: boolean;
  counting: boolean | null;
  pairOptions: { id: string; name: string }[];
  pairedWithId: string | null;
  onChange: (patch: Partial<Component>) => void;
  onRemove: () => void;
  onPair: (otherId: string | null) => void;
}

export function ComponentCard({
  component,
  editing,
  summary,
  showNormalized,
  counting,
  pairOptions,
  pairedWithId,
  onChange,
  onRemove,
  onPair,
}: ComponentCardProps) {
  const setItem = (id: string, p: Partial<Item>) =>
    onChange({ items: component.items.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  const removeItem = (id: string) =>
    onChange({ items: component.items.filter((it) => it.id !== id) });
  const addItem = () =>
    onChange({
      items: [
        ...component.items,
        { id: uid(), label: `${component.name} ${component.items.length + 1}` },
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
    else if (kind === "dropLowest")
      drop = { kind: "dropLowest", dropLowest: Math.max(1, count || 1) };
    onChange({ drop });
  };

  const gradedNote =
    summary && summary.totalItems > 1 && summary.gradedCount < summary.totalItems
      ? `${summary.gradedCount} of ${summary.totalItems} graded`
      : null;
  const dropNote =
    component.drop?.kind === "keepBest"
      ? `best ${component.drop.keep} of ${component.items.length} count`
      : component.drop?.kind === "dropLowest"
        ? `lowest ${component.drop.dropLowest} dropped`
        : null;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line/70 bg-paper-sunk/40 px-4 py-2.5">
        {editing ? (
          <input
            value={component.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="min-w-0 flex-1 rounded bg-paper-card px-2 py-0.5 font-display text-base font-semibold outline-none ring-1 ring-line focus:ring-accent"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
            {component.name}
          </h3>
        )}

        {counting === true && (
          <span className="inline-flex items-center gap-1 rounded-full bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">
            ✓ counting
          </span>
        )}

        {editing ? (
          <label className="flex shrink-0 items-center gap-1 text-sm text-ink-soft">
            <input
              type="number"
              min={0}
              value={component.weight || ""}
              onChange={(e) => onChange({ weight: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 rounded border border-line bg-paper-card px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
            />
            wt
          </label>
        ) : (
          <span className="shrink-0 rounded-full bg-paper-sunk px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {showNormalized && summary
              ? `${component.weight} wt · ${summary.weight.toFixed(summary.weight % 1 ? 1 : 0)}%`
              : `${component.weight}%`}
          </span>
        )}

        {editing && (
          <button
            onClick={onRemove}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-faint hover:bg-bad/10 hover:text-bad"
            title="Remove component"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-line/60">
        {component.items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 px-4 py-2">
            {editing ? (
              <input
                value={it.label}
                onChange={(e) => setItem(it.id, { label: e.target.value })}
                className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm outline-none ring-1 ring-line/60 focus:ring-accent"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm">{it.label}</span>
            )}
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={it.score ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) =>
                setItem(it.id, {
                  score: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                })
              }
              placeholder="—"
              className="w-16 rounded-md border border-line bg-paper-card px-2 py-1 text-right text-sm tabular-nums outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <span className="w-3 text-sm text-ink-faint">%</span>
            {editing && (
              <button
                onClick={() => removeItem(it.id)}
                className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:text-bad"
                title="Remove item"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer: passive notes in view mode; full controls in edit mode */}
      {editing ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 px-4 py-2.5 text-xs text-ink-soft">
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
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
              min={1}
              value={dropCount}
              onChange={(e) => setDrop(dropKind, Number(e.target.value))}
              className="w-14 rounded border border-line bg-paper-card px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
            />
          )}
          <label className="flex items-center gap-1.5" title="Only the better-scoring of the pair counts toward the grade">
            <span className="text-ink-faint">Better of</span>
            <select
              value={pairedWithId ?? ""}
              onChange={(e) => onPair(e.target.value || null)}
              className="max-w-40 rounded border border-line bg-paper-card px-1.5 py-1 outline-none focus:border-accent"
            >
              <option value="">—</option>
              {pairOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  this vs {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        (dropNote || gradedNote) && (
          <div className="border-t border-line/70 px-4 py-2 text-xs text-ink-faint">
            {[dropNote, gradedNote].filter(Boolean).join(" · ")}
          </div>
        )
      )}
    </div>
  );
}
