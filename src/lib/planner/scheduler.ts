import type { CatalogCourse, Major, PrereqExpr } from "./types";
import { prereqCourses, satisfied } from "./prereq";
import { parseCode } from "./codes";
import { evaluate } from "./requirements";

// Forward course scheduler: given what a student still needs (from the major
// requirement evaluation), lay the courses out across the remaining study
// terms respecting prerequisites (backward), antirequisites (forward), and
// terms offered — front-loading prereq-chain roots. Fails loudly: anything that
// can't be placed comes back in `unplaced` rather than a silent bucket.

export type Catalog = Map<string, CatalogCourse>;

export interface PlannedTerm {
  level: string; // "3A"
  season: "F" | "W";
  courses: string[];
}

export interface Schedule {
  terms: PlannedTerm[];
  /** Needed courses that couldn't be placed within the remaining terms. */
  unplaced: string[];
}

const A_TERM_SEASON = "F" as const;
const B_TERM_SEASON = "W" as const;

function seasonOf(level: string): "F" | "W" {
  return level.endsWith("B") ? B_TERM_SEASON : A_TERM_SEASON;
}

/** Minimal set of extra courses (beyond `have`) needed to satisfy an expression. */
function chooseToSatisfy(expr: PrereqExpr | undefined, have: Set<string>): string[] {
  if (!expr || satisfied(expr, have)) return [];
  if ("course" in expr) return [expr.course];
  if ("all" in expr) return expr.all.flatMap((e) => chooseToSatisfy(e, have));
  const branches = "oneOf" in expr ? expr.oneOf : expr.nOf.of;
  const n = "oneOf" in expr ? 1 : expr.nOf.n;
  // Pick the n cheapest branches by how many new courses they add.
  return branches
    .map((b) => chooseToSatisfy(b, have))
    .sort((a, b) => a.length - b.length)
    .slice(0, n)
    .flat();
}

/** Union of still-needed courses across the majors, plus their prereq closure. */
export function neededCourses(majors: Major[], taken: Set<string>, catalog: Catalog): Set<string> {
  const need = new Set<string>();
  for (const m of majors) {
    for (const code of evaluate(m, taken, catalog).remainingCourses) {
      if (!taken.has(code)) need.add(code);
    }
  }
  // Fixpoint: pull in prerequisites of needed courses that aren't already met.
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of [...need]) {
      const course = catalog.get(code);
      if (!course?.prereq) continue;
      const have = new Set([...taken, ...need]);
      for (const add of chooseToSatisfy(course.prereq, have)) {
        if (!taken.has(add) && !need.has(add)) {
          need.add(add);
          changed = true;
        }
      }
    }
  }
  return need;
}

/** How many still-needed courses list `code` among their prerequisites. */
function unlockCount(code: string, need: Set<string>, catalog: Catalog): number {
  let n = 0;
  for (const other of need) {
    if (other === code) continue;
    if (prereqCourses(catalog.get(other)?.prereq).includes(code)) n++;
  }
  return n;
}

export interface ScheduleInput {
  majors: Major[];
  taken: Set<string>;
  catalog: Catalog;
  /** Remaining study-term levels to fill, in order, e.g. ["3A","3B","4A","4B"]. */
  levels: string[];
  maxPerTerm?: number;
}

export function schedule({ majors, taken, catalog, levels, maxPerTerm = 5 }: ScheduleInput): Schedule {
  const need = neededCourses(majors, taken, catalog);
  const placed = new Set(taken); // courses available to satisfy prereqs so far
  const scheduledEver = new Set<string>();
  const terms: PlannedTerm[] = [];

  for (const level of levels) {
    const season = seasonOf(level);
    const availableBefore = new Set(placed); // prereqs must come from earlier terms
    const chosen: string[] = [];

    // Repeatedly pick the best eligible course for this term.
    while (chosen.length < maxPerTerm) {
      const eligible = [...need].filter((code) => {
        if (scheduledEver.has(code) || chosen.includes(code)) return false;
        const course = catalog.get(code);
        if (!satisfied(course?.prereq, availableBefore)) return false;
        // Antireq guard: none of its antireqs already held or scheduled.
        const anti = course?.antireq ?? [];
        if (anti.some((a) => placed.has(a) || scheduledEver.has(a) || chosen.includes(a))) return false;
        // Terms-offered guard.
        if (course?.termsOffered && !course.termsOffered.includes(season)) return false;
        return true;
      });
      if (eligible.length === 0) break;
      eligible.sort((a, b) => {
        const u = unlockCount(b, need, catalog) - unlockCount(a, need, catalog);
        if (u !== 0) return u;
        return (parseCode(a)?.number ?? 0) - (parseCode(b)?.number ?? 0);
      });
      chosen.push(eligible[0]);
    }

    for (const c of chosen) scheduledEver.add(c);
    for (const c of chosen) placed.add(c); // available for the next term
    terms.push({ level, season, courses: chosen });
  }

  const unplaced = [...need].filter((c) => !scheduledEver.has(c));
  return { terms, unplaced };
}
