// Small date helpers for coursework deadlines. Deadlines are plain calendar
// dates ("YYYY-MM-DD"), so everything is computed at UTC midnight to keep day
// arithmetic free of timezone drift. `today` is always passed in (never read
// from the clock inside a pure helper) so the logic is deterministic to test;
// `todayISO()` is the one impure helper the app calls at the edge.

const MS_PER_DAY = 86_400_000;

/** Parse an ISO "YYYY-MM-DD" string to a UTC-midnight Date, or null if invalid. */
export function parseISODate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject overflow like 2026-13-40 that Date would silently roll over.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** Today's local calendar date as ISO "YYYY-MM-DD". The app's clock edge. */
export function todayISO(): string {
  const d = new Date();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${da}`;
}

/** Whole days from `today` to `due` (both ISO). Positive = future, negative = past. null if unparseable. */
export function daysUntil(due: string, today: string): number | null {
  const a = parseISODate(due);
  const b = parseISODate(today);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export type DueStatus = "overdue" | "today" | "soon" | "upcoming" | "none";

/** Bucket a due date relative to `today` for styling. "soon" = within a week. */
export function dueStatus(due: string | undefined, today: string): DueStatus {
  const n = due ? daysUntil(due, today) : null;
  if (n === null) return "none";
  if (n < 0) return "overdue";
  if (n === 0) return "today";
  if (n <= 7) return "soon";
  return "upcoming";
}

function formatAbsolute(date: Date, today: string): string {
  const t = parseISODate(today);
  const sameYear = t != null && date.getUTCFullYear() === t.getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", {
    weekday: sameYear ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Human-friendly due label relative to `today`:
 * "Today", "Tomorrow", "Yesterday", "In 3 days", "Overdue by 2 days",
 * and an absolute "Fri, Oct 14" (or "Oct 14, 2027") beyond a week out.
 * Empty string when `due` can't be parsed.
 */
export function formatDue(due: string, today: string): string {
  const n = daysUntil(due, today);
  if (n === null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `Overdue by ${-n} days`;
  if (n <= 7) return `In ${n} days`;
  return formatAbsolute(parseISODate(due)!, today);
}

/** Comparator: earliest due first; undated items sort last. */
export function byDue(a: { due?: string }, b: { due?: string }): number {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
}
