import type { TranscriptEntry } from "../types";

// Pure performance math over completed-course transcript entries. Grades are
// percentages; averages are credit-weighted (an unset credit counts as 1, a
// credit of 0 contributes nothing — matching the dashboard's term average).

/** Weight of an entry in averages: its credits, or 1 when unset. */
function weightOf(e: TranscriptEntry): number {
  return e.credits != null ? e.credits : 1;
}

/** Entries that count toward averages: a graded status with a numeric grade. */
export function graded(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.filter(
    (e) => e.status === "graded" && typeof e.grade === "number" && !Number.isNaN(e.grade),
  );
}

/** Credit-weighted mean of graded entries, or null if none contribute weight. */
export function cumulativeAverage(entries: TranscriptEntry[]): number | null {
  let sum = 0;
  let w = 0;
  for (const e of graded(entries)) {
    const cw = weightOf(e);
    sum += (e.grade as number) * cw;
    w += cw;
  }
  return w > 0 ? sum / w : null;
}

/** Sum of credit weights across entries (unset counts as 1). */
export function sumCredits(entries: TranscriptEntry[]): number {
  return entries.reduce((s, e) => s + weightOf(e), 0);
}

const SEASONS: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };

/** Chronological rank for recognized term formats, else null. */
function termRank(term: string): number | null {
  const t = term.trim().toLowerCase();
  let m = /^(winter|spring|summer|fall)\s+(\d{4})$/.exec(t);
  if (m) return Number(m[2]) * 4 + SEASONS[m[1]];
  m = /^(\d{4})\s+(winter|spring|summer|fall)$/.exec(t);
  if (m) return Number(m[1]) * 4 + SEASONS[m[2]];
  // Waterloo academic level, e.g. "1A".."8B" — kept in a distinct high range.
  m = /^([1-8])([ab])$/.exec(t);
  if (m) return 1_000_000 + Number(m[1]) * 2 + (m[2] === "b" ? 1 : 0);
  return null;
}

/**
 * Comparator ordering terms chronologically for recognized formats; known
 * terms sort before unknown ones, and two unknowns compare equal so a stable
 * sort preserves their original (first-seen) order. Never throws.
 */
export function compareTerms(a: string, b: string): number {
  const ra = termRank(a);
  const rb = termRank(b);
  if (ra != null && rb != null) return ra - rb;
  if (ra != null) return -1;
  if (rb != null) return 1;
  return 0;
}

export interface TermGroup {
  term: string;
  entries: TranscriptEntry[];
  average: number | null;
  credits: number;
  count: number;
}

/** Group entries by term, ordered chronologically (unknown terms keep first-seen order). */
export function byTerm(entries: TranscriptEntry[]): TermGroup[] {
  const order: string[] = [];
  const map = new Map<string, TranscriptEntry[]>();
  for (const e of entries) {
    const key = e.term || "—";
    const arr = map.get(key);
    if (arr) arr.push(e);
    else {
      map.set(key, [e]);
      order.push(key);
    }
  }
  const groups: TermGroup[] = order.map((term) => {
    const es = map.get(term) as TranscriptEntry[];
    return { term, entries: es, average: cumulativeAverage(es), credits: sumCredits(es), count: es.length };
  });
  return groups.sort((g1, g2) => compareTerms(g1.term, g2.term));
}

export interface GradeBand {
  label: string;
  lo: number;
  hi: number; // exclusive upper bound
  count: number;
}

const BANDS: Omit<GradeBand, "count">[] = [
  { label: "<50", lo: 0, hi: 50 },
  { label: "50–59", lo: 50, hi: 60 },
  { label: "60–69", lo: 60, hi: 70 },
  { label: "70–79", lo: 70, hi: 80 },
  { label: "80–89", lo: 80, hi: 90 },
  { label: "90–100", lo: 90, hi: 101 },
];

/** Count graded entries into six percentage bands. */
export function distribution(entries: TranscriptEntry[]): GradeBand[] {
  const bands: GradeBand[] = BANDS.map((b) => ({ ...b, count: 0 }));
  for (const e of graded(entries)) {
    const g = e.grade as number;
    const band = bands.find((b) => g >= b.lo && g < b.hi) ?? (g >= 90 ? bands[bands.length - 1] : undefined);
    if (band) band.count++;
  }
  return bands;
}

/** Highest and lowest graded entries (null when nothing is graded). */
export function extremes(entries: TranscriptEntry[]): {
  best: TranscriptEntry | null;
  worst: TranscriptEntry | null;
} {
  const g = graded(entries);
  if (g.length === 0) return { best: null, worst: null };
  let best = g[0];
  let worst = g[0];
  for (const e of g) {
    if ((e.grade as number) > (best.grade as number)) best = e;
    if ((e.grade as number) < (worst.grade as number)) worst = e;
  }
  return { best, worst };
}

export interface TranscriptTotals {
  /** Graded courses — the ones counted in the average. */
  graded: number;
  /** Summed credits of graded courses. */
  credits: number;
  /** Courses currently in progress (no grade yet). */
  inProgress: number;
  /** Credit (CR) courses. */
  credit: number;
}

export function totals(entries: TranscriptEntry[]): TranscriptTotals {
  const g = graded(entries);
  return {
    graded: g.length,
    credits: sumCredits(g),
    inProgress: entries.filter((e) => e.status === "in-progress").length,
    credit: entries.filter((e) => e.status === "credit").length,
  };
}
