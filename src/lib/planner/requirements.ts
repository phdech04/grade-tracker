import type { CatalogCourse, Major, ReqGroup } from "./types";
import { isMathSubject, normalizeCode, parseCode } from "./codes";

// Evaluate a major's requirement tree against the courses a student has taken.
// Each major is scored independently over the full taken set, so a course can
// count toward both plans (double-counting) — the intended behaviour here.

export interface GroupProgress {
  label: string;
  /** How many sub-requirements/courses are needed, and how many are met. */
  need: number;
  have: number;
  satisfied: boolean;
  /** Recommended course codes still outstanding (best-effort). */
  remaining: string[];
}

export interface MajorProgress {
  majorId: string;
  complete: boolean;
  groups: GroupProgress[];
  /** Course codes still needed across the whole major (deduped, recommended). */
  remainingCourses: string[];
  mathUnits: number;
  nonMathUnits: number;
  mathUnitsOk: boolean;
  nonMathUnitsOk: boolean;
}

type Catalog = Map<string, CatalogCourse>;

/** Build a lookup that also resolves cross-listed codes to the same course. */
export function buildCatalog(courses: CatalogCourse[]): Catalog {
  const map = new Map<string, CatalogCourse>();
  for (const c of courses) {
    map.set(normalizeCode(c.code), c);
    for (const x of c.crosslist ?? []) map.set(normalizeCode(x), c);
  }
  return map;
}

/** True if `code` (or any of its cross-listed equivalents) is in the taken set. */
function held(code: string, taken: Set<string>, catalog: Catalog): boolean {
  const norm = normalizeCode(code);
  if (taken.has(norm)) return true;
  const c = catalog.get(norm);
  if (c) {
    for (const x of [c.code, ...(c.crosslist ?? [])]) if (taken.has(normalizeCode(x))) return true;
  }
  return false;
}

/** Recursively evaluate one requirement node → { met, remaining recommended codes }. */
function evalNode(
  node: ReqGroup,
  taken: Set<string>,
  catalog: Catalog,
): { met: boolean; remaining: string[] } {
  switch (node.kind) {
    case "course": {
      const met = held(node.code, taken, catalog);
      return { met, remaining: met ? [] : [normalizeCode(node.code)] };
    }
    case "all": {
      const parts = node.of.map((n) => evalNode(n, taken, catalog));
      return { met: parts.every((p) => p.met), remaining: parts.flatMap((p) => p.remaining) };
    }
    case "chooseN": {
      const parts = node.of.map((n) => evalNode(n, taken, catalog));
      const metCount = parts.filter((p) => p.met).length;
      if (metCount >= node.n) return { met: true, remaining: [] };
      // Recommend the cheapest (fewest outstanding courses) unmet options.
      const unmet = parts
        .filter((p) => !p.met)
        .sort((a, b) => a.remaining.length - b.remaining.length)
        .slice(0, node.n - metCount);
      return { met: false, remaining: unmet.flatMap((p) => p.remaining) };
    }
    case "pattern": {
      const matches = [...taken].filter((code) => matchesPattern(code, node)).length;
      const short = Math.max(0, node.n - matches);
      if (short === 0) return { met: true, remaining: [] };
      // Recommend from an explicit pool when present, else leave abstract.
      const pool = (node.pool ?? [])
        .map(normalizeCode)
        .filter((c) => !held(c, taken, catalog))
        .slice(0, short);
      return { met: false, remaining: pool };
    }
  }
}

function matchesPattern(code: string, node: Extract<ReqGroup, { kind: "pattern" }>): boolean {
  const p = parseCode(code);
  if (!p) return false;
  if (node.pool && node.pool.length > 0) {
    return node.pool.map(normalizeCode).includes(normalizeCode(code));
  }
  if (node.subjects.length > 0 && !node.subjects.includes(p.subject)) return false;
  if (node.minLevel != null && p.number < node.minLevel) return false;
  if (node.maxLevel != null && p.number > node.maxLevel) return false;
  return true;
}

export function evaluate(major: Major, taken: Set<string>, catalog: Catalog): MajorProgress {
  const norm = new Set([...taken].map(normalizeCode));

  // Top-level groups for display (unwrap the outer "all").
  const topNodes = major.requirement.kind === "all" ? major.requirement.of : [major.requirement];
  const groups: GroupProgress[] = topNodes.map((n) => {
    const r = evalNode(n, norm, catalog);
    const need = countLeaves(n);
    return {
      label: nodeLabel(n),
      need,
      have: need - outstandingLeaves(n, norm, catalog),
      satisfied: r.met,
      remaining: r.remaining,
    };
  });

  // Units: every taken math-faculty course counts toward math units; the rest
  // toward non-math. Unknown courses fall back to 0.5 units.
  let mathUnits = 0;
  let nonMathUnits = 0;
  for (const code of norm) {
    const units = catalog.get(code)?.units ?? 0.5;
    if (isMathSubject(code)) mathUnits += units;
    else nonMathUnits += units;
  }

  const remainingCourses = [...new Set(groups.flatMap((g) => g.remaining))];
  const mathUnitsOk = mathUnits >= major.minMathUnits;
  const nonMathUnitsOk = nonMathUnits >= major.minNonMathUnits;

  return {
    majorId: major.id,
    complete: groups.every((g) => g.satisfied) && mathUnitsOk && nonMathUnitsOk,
    groups,
    remainingCourses,
    mathUnits,
    nonMathUnits,
    mathUnitsOk,
    nonMathUnitsOk,
  };
}

function nodeLabel(n: ReqGroup): string {
  if (n.kind === "course") return n.code;
  if (n.kind === "pattern") return n.label;
  return n.label ?? (n.kind === "all" ? "Complete all" : `Complete ${n.n}`);
}

/** Count of "slots" a node needs (for a rough have/need progress display). */
function countLeaves(n: ReqGroup): number {
  if (n.kind === "course") return 1;
  if (n.kind === "pattern") return n.n;
  if (n.kind === "chooseN") return n.n;
  return n.of.reduce((s, c) => s + countLeaves(c), 0);
}

function outstandingLeaves(n: ReqGroup, taken: Set<string>, catalog: Catalog): number {
  if (n.kind === "course") return held(n.code, taken, catalog) ? 0 : 1;
  if (n.kind === "pattern") {
    const matches = [...taken].filter((c) => matchesPattern(c, n)).length;
    return Math.max(0, n.n - matches);
  }
  if (n.kind === "all") return n.of.reduce((s, c) => s + outstandingLeaves(c, taken, catalog), 0);
  // chooseN: outstanding = n - (met options), floored at 0.
  const met = n.of.filter((c) => evalNode(c, taken, catalog).met).length;
  return Math.max(0, n.n - met);
}
