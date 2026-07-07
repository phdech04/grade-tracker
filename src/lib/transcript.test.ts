import { describe, expect, it } from "vitest";
import type { TranscriptEntry } from "../types";
import {
  byTerm,
  compareTerms,
  cumulativeAverage,
  distribution,
  extremes,
  graded,
  totals,
} from "./transcript";

let seq = 0;
const entry = (p: Partial<TranscriptEntry> = {}): TranscriptEntry => ({
  id: `e${seq++}`,
  name: "Course",
  term: "Fall 2025",
  source: "manual",
  ...p,
});

describe("cumulativeAverage", () => {
  it("credit-weights graded entries", () => {
    // (90*0.5 + 70*0.25) / (0.5 + 0.25) = 62.5/0.75 = 83.33…
    const avg = cumulativeAverage([
      entry({ grade: 90, credits: 0.5 }),
      entry({ grade: 70, credits: 0.25 }),
    ]);
    expect(avg).toBeCloseTo((90 * 0.5 + 70 * 0.25) / 0.75, 5);
  });

  it("treats an unset credit as weight 1", () => {
    // (80*1 + 60*1)/2 = 70
    expect(cumulativeAverage([entry({ grade: 80 }), entry({ grade: 60 })])).toBe(70);
  });

  it("excludes ungraded entries", () => {
    expect(cumulativeAverage([entry({ grade: 88 }), entry({ grade: undefined })])).toBe(88);
  });

  it("gives a credit-0 entry zero weight", () => {
    // credit 0 contributes nothing; only the weight-1 course counts
    expect(cumulativeAverage([entry({ grade: 100, credits: 0 }), entry({ grade: 50 })])).toBe(50);
  });

  it("returns null when nothing is graded", () => {
    expect(cumulativeAverage([entry({ grade: undefined })])).toBeNull();
    expect(cumulativeAverage([])).toBeNull();
  });
});

describe("graded", () => {
  it("keeps only numeric grades", () => {
    expect(graded([entry({ grade: 0 }), entry({ grade: undefined }), entry({ grade: 75 })])).toHaveLength(2);
  });
});

describe("compareTerms + byTerm ordering", () => {
  it("orders Season YYYY chronologically", () => {
    expect(compareTerms("Fall 2025", "Winter 2026")).toBeLessThan(0);
    expect(compareTerms("Winter 2026", "Spring 2026")).toBeLessThan(0);
    expect(compareTerms("Fall 2026", "Fall 2025")).toBeGreaterThan(0);
  });

  it("orders Waterloo level codes", () => {
    expect(compareTerms("1A", "1B")).toBeLessThan(0);
    expect(compareTerms("1B", "2A")).toBeLessThan(0);
  });

  it("sorts known terms before unknown and keeps unknowns in first-seen order", () => {
    const entries = [
      entry({ term: "Bridging", grade: 70 }),
      entry({ term: "Fall 2025", grade: 80 }),
      entry({ term: "Exchange", grade: 90 }),
    ];
    const groups = byTerm(entries).map((g) => g.term);
    // "Fall 2025" (known) first, then the two unknowns in original order.
    expect(groups).toEqual(["Fall 2025", "Bridging", "Exchange"]);
  });

  it("groups entries and computes per-term averages", () => {
    const groups = byTerm([
      entry({ term: "Fall 2025", grade: 80 }),
      entry({ term: "Fall 2025", grade: 90 }),
      entry({ term: "Winter 2026", grade: 70 }),
    ]);
    expect(groups.map((g) => g.term)).toEqual(["Fall 2025", "Winter 2026"]);
    expect(groups[0].average).toBe(85);
    expect(groups[0].count).toBe(2);
    expect(groups[1].average).toBe(70);
  });
});

describe("distribution", () => {
  it("buckets grades with correct band edges", () => {
    const dist = distribution([
      entry({ grade: 49 }), // <50
      entry({ grade: 50 }), // 50–59
      entry({ grade: 90 }), // 90–100
      entry({ grade: 100 }), // 90–100
      entry({ grade: 73 }), // 70–79
    ]);
    const byLabel = Object.fromEntries(dist.map((b) => [b.label, b.count]));
    expect(byLabel["<50"]).toBe(1);
    expect(byLabel["50–59"]).toBe(1);
    expect(byLabel["70–79"]).toBe(1);
    expect(byLabel["90–100"]).toBe(2);
    expect(byLabel["60–69"]).toBe(0);
  });
});

describe("extremes", () => {
  it("finds best and worst graded entries", () => {
    const { best, worst } = extremes([
      entry({ name: "Low", grade: 55 }),
      entry({ name: "High", grade: 95 }),
      entry({ name: "Mid", grade: 75 }),
      entry({ name: "Ungraded", grade: undefined }),
    ]);
    expect(best?.name).toBe("High");
    expect(worst?.name).toBe("Low");
  });

  it("returns nulls when nothing is graded", () => {
    expect(extremes([entry({ grade: undefined })])).toEqual({ best: null, worst: null });
  });
});

describe("totals", () => {
  it("counts courses, summed credits, and graded count", () => {
    const t = totals([
      entry({ grade: 80, credits: 0.5 }),
      entry({ grade: undefined, credits: 0.5 }),
      entry({ grade: 90 }), // unset credit -> 1
    ]);
    expect(t.courses).toBe(3);
    expect(t.credits).toBeCloseTo(2, 5);
    expect(t.gradedCount).toBe(2);
  });
});
