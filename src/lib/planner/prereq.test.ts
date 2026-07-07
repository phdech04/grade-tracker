import { describe, expect, it } from "vitest";
import { prereqCourses, satisfied } from "./prereq";
import type { PrereqExpr } from "./types";

const taken = (...codes: string[]) => new Set(codes);

describe("satisfied", () => {
  it("treats an empty prereq as satisfied", () => {
    expect(satisfied(undefined, taken())).toBe(true);
  });

  it("evaluates a single course", () => {
    expect(satisfied({ course: "MATH 137" }, taken("MATH 137"))).toBe(true);
    expect(satisfied({ course: "MATH 137" }, taken("MATH 135"))).toBe(false);
  });

  it("evaluates AND (all)", () => {
    const e: PrereqExpr = { all: [{ course: "MATH 136" }, { course: "MATH 138" }] };
    expect(satisfied(e, taken("MATH 136", "MATH 138"))).toBe(true);
    expect(satisfied(e, taken("MATH 136"))).toBe(false);
  });

  it("evaluates OR (oneOf) and nesting", () => {
    // MATH 237 requires MATH 136 and (MATH 138 or MATH 148)
    const e: PrereqExpr = {
      all: [{ course: "MATH 136" }, { oneOf: [{ course: "MATH 138" }, { course: "MATH 148" }] }],
    };
    expect(satisfied(e, taken("MATH 136", "MATH 148"))).toBe(true);
    expect(satisfied(e, taken("MATH 136"))).toBe(false);
  });

  it("evaluates nOf", () => {
    const e: PrereqExpr = {
      nOf: { n: 2, of: [{ course: "A" }, { course: "B" }, { course: "C" }] },
    };
    expect(satisfied(e, taken("A", "C"))).toBe(true);
    expect(satisfied(e, taken("A"))).toBe(false);
  });
});

describe("prereqCourses", () => {
  it("flattens all referenced codes without duplicates", () => {
    const e: PrereqExpr = {
      all: [{ course: "MATH 136" }, { oneOf: [{ course: "MATH 138" }, { course: "MATH 136" }] }],
    };
    expect(prereqCourses(e).sort()).toEqual(["MATH 136", "MATH 138"]);
  });
});
