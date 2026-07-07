import type { CatalogCourse, Major } from "./types";
import { closure, prereqCourses, satisfied } from "./prereq";
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

/** Union of still-needed courses across the majors, plus their prereq closure.
 * Majors are evaluated in sequence against `taken` PLUS what's been chosen so
 * far, so the second major reuses the first's picks (double-counting) and won't
 * recommend a course whose antirequisite is already planned. The prereq closure
 * is catalog-aware, so only real, schedulable courses ever enter the plan. */
export function neededCourses(majors: Major[], taken: Set<string>, catalog: Catalog): Set<string> {
  const catalogCodes = new Set(catalog.keys());
  const need = new Set<string>();
  for (const m of majors) {
    const effective = new Set([...taken, ...need]);
    for (const code of evaluate(m, effective, catalog).remainingCourses) {
      if (!taken.has(code)) need.add(code);
    }
  }
  // Fixpoint: pull in the (catalog-valid) prerequisites of needed courses.
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of [...need]) {
      const course = catalog.get(code);
      if (!course?.prereq) continue;
      const have = new Set([...taken, ...need]);
      const add = closure(course.prereq, have, catalogCodes);
      if (!add) continue; // prereq unsatisfiable from the catalog — leave it to surface as unplaced
      for (const a of add) {
        if (!taken.has(a) && !need.has(a)) {
          need.add(a);
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
