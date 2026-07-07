import { describe, expect, it } from "vitest";
import type { TranscriptEntry } from "../../types";
import {
  completedStudyTerms,
  inProgressCourses,
  remainingStudyTerms,
  takenFromTranscript,
} from "./backfill";

let seq = 0;
const e = (p: Partial<TranscriptEntry>): TranscriptEntry => ({
  id: `t${seq++}`,
  name: "C",
  term: "Fall 2024",
  status: "graded",
  source: "import",
  ...p,
});

describe("takenFromTranscript", () => {
  it("includes passing grades and CR, and skips fails/ungraded/withdrawn/no-code", () => {
    const taken = takenFromTranscript([
      e({ code: "cs135", status: "graded", grade: 83 }),
      e({ code: "CS 136L", status: "credit" }),
      e({ code: "MATH 100", status: "graded", grade: 35 }), // failed → not passed
      e({ code: "MATH 999", status: "in-progress" }),
      e({ code: "PHYS 111", status: "withdrawn" }),
      e({ code: undefined, status: "graded", grade: 90 }),
    ]);
    expect(taken.has("CS 135")).toBe(true);
    expect(taken.has("CS 136L")).toBe(true);
    expect(taken.has("MATH 100")).toBe(false);
    expect(taken.has("MATH 999")).toBe(false);
    expect(taken.has("PHYS 111")).toBe(false);
    expect(taken.size).toBe(2);
  });

  it("excludes PD and co-op milestone courses", () => {
    const taken = takenFromTranscript([
      e({ code: "PD 1", status: "credit" }),
      e({ code: "COOP 1", status: "credit" }),
      e({ code: "MATH 135", status: "graded", grade: 84 }),
    ]);
    expect(taken.has("MATH 135")).toBe(true);
    expect(taken.has("PD 1")).toBe(false);
    expect(taken.has("COOP 1")).toBe(false);
  });
});

describe("inProgressCourses", () => {
  it("returns academic in-progress courses only (this term), excluding PD/co-op", () => {
    const current = inProgressCourses([
      e({ code: "ACTSC 372", status: "in-progress" }),
      e({ code: "AMATH 250", status: "in-progress" }),
      e({ code: "PD 14", status: "in-progress" }),
      e({ code: "MATH 135", status: "graded", grade: 84 }), // not in progress
    ]);
    expect(current.sort()).toEqual(["ACTSC 372", "AMATH 250"]);
  });
});

describe("completed / remaining study terms", () => {
  it("counts distinct graded terms and derives the remaining of 8", () => {
    const t = [
      e({ term: "Fall 2024", status: "graded" }),
      e({ term: "Fall 2024", status: "graded" }),
      e({ term: "Winter 2025", status: "graded" }),
      e({ term: "Spring 2025", status: "credit" }), // CR-only term doesn't count
    ];
    expect(completedStudyTerms(t)).toBe(2);
    expect(remainingStudyTerms(t)).toBe(6);
  });
});
