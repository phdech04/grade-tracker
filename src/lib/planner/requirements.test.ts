import { describe, expect, it } from "vitest";
import { buildCatalog, evaluate } from "./requirements";
import type { CatalogCourse } from "./types";
import { majorById } from "../../data/majors";

// Minimal catalog covering the codes these tests touch. AMATH 242 and CS 371
// are the same course (cross-listed), which the evaluator must treat as equal.
const catalog = buildCatalog([
  { code: "AMATH 242", title: "Intro Computational Math", units: 0.5, faculty: "math", crosslist: ["CS 371"] },
  { code: "MATH 237", title: "Calculus 3", units: 0.5, faculty: "math" },
  { code: "MATH 247", title: "Calculus 3 (Adv)", units: 0.5, faculty: "math" },
  { code: "PMATH 333", title: "Intro Real Analysis", units: 0.5, faculty: "math" },
  { code: "AMATH 445", title: "Scientific ML", units: 0.5, faculty: "math" },
  { code: "AMATH 342", title: "Comp Methods DE", units: 0.5, faculty: "math" },
] as CatalogCourse[]);

describe("evaluate — Mathematical Finance", () => {
  const major = majorById("math-finance")!;

  it("is incomplete with nothing taken and lists remaining core courses", () => {
    const p = evaluate(major, new Set(), catalog);
    expect(p.complete).toBe(false);
    expect(p.remainingCourses).toContain("ACTSC 231");
    expect(p.mathUnitsOk).toBe(false);
  });

  it("counts a cross-listed course: CS 371 satisfies the AMATH 242/CS 371 choice", () => {
    const withCs371 = evaluate(major, new Set(["CS 371"]), catalog);
    const compGroup = withCs371.groups.find((g) => g.label === "Computational math");
    expect(compGroup?.satisfied).toBe(true);
  });

  it("accepts the MATH 247 branch OR the MATH 237 + PMATH 333 branch", () => {
    const via247 = evaluate(major, new Set(["MATH 247"]), catalog);
    const calc = via247.groups.find((g) => g.label === "Calculus 3 stream");
    expect(calc?.satisfied).toBe(true);

    const viaPair = evaluate(major, new Set(["MATH 237", "PMATH 333"]), catalog);
    expect(viaPair.groups.find((g) => g.label === "Calculus 3 stream")?.satisfied).toBe(true);

    const partial = evaluate(major, new Set(["MATH 237"]), catalog);
    expect(partial.groups.find((g) => g.label === "Calculus 3 stream")?.satisfied).toBe(false);
  });

  it("tallies math vs non-math units by subject", () => {
    const p = evaluate(major, new Set(["MATH 237", "ECON 101"]), catalog);
    expect(p.mathUnits).toBeCloseTo(0.5, 5); // MATH counts as math
    expect(p.nonMathUnits).toBeCloseTo(0.5, 5); // ECON counts as non-math
  });
});

describe("evaluate — Applied Math (pattern requirements)", () => {
  const major = majorById("applied-math-scicomp")!;

  it("satisfies '2 more AMATH 300/400-level' once two qualifying courses are taken", () => {
    const p = evaluate(major, new Set(["AMATH 342", "AMATH 445"]), catalog);
    const pat = p.groups.find((g) => g.label.startsWith("2 more AMATH"));
    expect(pat?.satisfied).toBe(true);
  });

  it("does not satisfy the 400-level pattern with only a 300-level course", () => {
    const p = evaluate(major, new Set(["AMATH 342"]), catalog);
    const pat400 = p.groups.find((g) => g.label.startsWith("1 more AMATH at the 400"));
    expect(pat400?.satisfied).toBe(false);
  });
});
