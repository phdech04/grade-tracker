import { describe, expect, it } from "vitest";
import { neededCourses, schedule } from "./scheduler";
import { satisfied } from "./prereq";
import { buildCatalog } from "./requirements";
import { CATALOG } from "../../data/catalog";
import { majorById } from "../../data/majors";
import type { CatalogCourse } from "./types";

const catalog = buildCatalog(CATALOG);
const majors = [majorById("math-finance")!, majorById("applied-math-scicomp")!];

// The student's passed courses through 2A (from the real transcript shape).
const taken = new Set([
  "CS 135", "CS 136", "CS 136L", "MATH 135", "MATH 136", "MATH 137", "MATH 138", "MATH 235",
  "MATH 237", "STAT 230", "ACTSC 231", "AFM 101", "ECON 101", "ECON 102", "ECON 201", "MTHEL 131",
]);

describe("scheduler over the real catalog", () => {
  const levels = ["2B", "3A", "3B", "4A", "4B"];
  const result = schedule({ majors, taken, catalog, levels });

  it("produces a prerequisite-valid ordering", () => {
    // Walk terms in order; each course's prereq must be satisfied by everything
    // taken plus everything scheduled in STRICTLY earlier terms.
    const have = new Set(taken);
    for (const term of result.terms) {
      for (const code of term.courses) {
        const course = catalog.get(code) as CatalogCourse | undefined;
        expect(satisfied(course?.prereq, have)).toBe(true);
      }
      for (const code of term.courses) have.add(code);
    }
  });

  it("never schedules a course whose antirequisite is already taken/planned", () => {
    const have = new Set(taken);
    for (const term of result.terms) {
      for (const code of term.courses) {
        const anti = catalog.get(code)?.antireq ?? [];
        for (const a of anti) expect(have.has(a)).toBe(false);
      }
      for (const code of term.courses) have.add(code);
    }
  });

  it("respects the per-term course cap", () => {
    for (const term of result.terms) expect(term.courses.length).toBeLessThanOrEqual(5);
  });

  it("only schedules courses that are actually needed", () => {
    const need = neededCourses(majors, taken, catalog);
    for (const term of result.terms) {
      for (const code of term.courses) expect(need.has(code)).toBe(true);
    }
  });

  it("does not schedule courses already taken", () => {
    for (const term of result.terms) {
      for (const code of term.courses) expect(taken.has(code)).toBe(false);
    }
  });
});
