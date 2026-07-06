import type { CourseEvent, EventKind } from "../types";
import { byDue, dueStatus, formatDue } from "../lib/dates";
import { uid } from "../lib/storage";

const KIND_OPTIONS: { value: EventKind; label: string }[] = [
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "lab", label: "Lab" },
  { value: "other", label: "Other" },
];

const KIND_LABEL: Record<EventKind, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
  project: "Project",
  lab: "Lab",
  other: "Task",
};

interface Props {
  events: CourseEvent[];
  /** Grading components, for the optional "counts toward" link in edit mode. */
  components: { id: string; name: string }[];
  editing: boolean;
  /** Today as ISO "YYYY-MM-DD" (injected so due labels are deterministic). */
  today: string;
  onChange: (events: CourseEvent[]) => void;
}

export function DeadlineList({ events, components, editing, today, onChange }: Props) {
  if (events.length === 0 && !editing) return null;

  const update = (id: string, p: Partial<CourseEvent>) =>
    onChange(events.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const remove = (id: string) => onChange(events.filter((e) => e.id !== id));
  const add = () =>
    onChange([
      ...events,
      { id: uid(), title: "New deadline", kind: "assignment", source: "manual" },
    ]);

  const sorted = [...events].sort(byDue);

  return (
    <div className="card mt-6 p-4">
      <p className="label mb-2">Deadlines</p>

      {events.length === 0 ? (
        <p className="text-sm text-ink-faint">No deadlines yet — add one below.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {sorted.map((e) =>
            editing ? (
              <EditRow
                key={e.id}
                event={e}
                components={components}
                onChange={(p) => update(e.id, p)}
                onRemove={() => remove(e.id)}
              />
            ) : (
              <ViewRow key={e.id} event={e} today={today} onToggle={() => update(e.id, { done: !e.done })} />
            ),
          )}
        </ul>
      )}

      {editing && (
        <button
          onClick={add}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add deadline
        </button>
      )}
    </div>
  );
}

function ViewRow({
  event,
  today,
  onToggle,
}: {
  event: CourseEvent;
  today: string;
  onToggle: () => void;
}) {
  const overdue = !event.done && dueStatus(event.due, today) === "overdue";
  const dueText = event.due ? formatDue(event.due, today) : event.dueRaw || "No date";

  return (
    <li className={`flex items-center gap-3 py-2 ${event.done ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={!!event.done}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-accent"
        title={event.done ? "Mark not done" : "Mark done"}
      />
      <span className="shrink-0 rounded bg-paper-sunk px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {KIND_LABEL[event.kind]}
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${event.done ? "line-through" : ""}`}>
        {event.title}
      </span>
      {event.weight != null && (
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">{event.weight}%</span>
      )}
      <span
        className={`shrink-0 text-xs tabular-nums ${
          overdue ? "font-semibold text-bad" : event.due ? "text-ink-soft" : "text-ink-faint"
        }`}
      >
        {dueText}
      </span>
    </li>
  );
}

function EditRow({
  event,
  components,
  onChange,
  onRemove,
}: {
  event: CourseEvent;
  components: { id: string; name: string }[];
  onChange: (p: Partial<CourseEvent>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input
        value={event.title}
        onChange={(e) => onChange({ title: e.target.value })}
        className="min-w-40 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none ring-1 ring-line/60 focus:ring-accent"
      />
      <select
        value={event.kind}
        onChange={(e) => onChange({ kind: e.target.value as EventKind })}
        className="rounded border border-line bg-paper-card px-1.5 py-1 text-xs outline-none focus:border-accent"
      >
        {KIND_OPTIONS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={event.due ?? ""}
        onChange={(e) => onChange({ due: e.target.value || undefined, dueRaw: undefined })}
        className="rounded border border-line bg-paper-card px-2 py-1 text-xs tabular-nums outline-none focus:border-accent"
      />
      {!event.due && event.dueRaw && (
        <span className="text-xs italic text-ink-faint" title="Detected from the outline — pick a date to resolve it">
          “{event.dueRaw}”
        </span>
      )}
      <input
        type="number"
        min={0}
        value={event.weight ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange({ weight: e.target.value === "" || !(n > 0) ? undefined : n });
        }}
        placeholder="wt%"
        className="w-16 rounded border border-line bg-paper-card px-2 py-1 text-right text-xs tabular-nums outline-none placeholder:text-ink-faint focus:border-accent"
      />
      {components.length > 0 && (
        <select
          value={event.componentId ?? ""}
          onChange={(e) => onChange({ componentId: e.target.value || undefined })}
          className="max-w-36 rounded border border-line bg-paper-card px-1.5 py-1 text-xs outline-none focus:border-accent"
          title="Counts toward"
        >
          <option value="">— component</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={onRemove}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-faint hover:text-bad"
        title="Remove deadline"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
