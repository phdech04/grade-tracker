import { describe, expect, it } from "vitest";
import type { TranscriptEntry } from "../../types";
import { completedStudyTerms, remainingStudyTerms, takenFromTranscript } from "./backfill";

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
  it("includes graded and CR passes, normalized, and skips ungraded/withdrawn/no-code", () => {
    const taken = takenFromTranscript([
      e({ code: "cs135", status: "graded" }),
      e({ code: "CS 136L", status: "credit" }),
      e({ code: "MATH 999", status: "in-progress" }),
      e({ code: "PHYS 111", status: "withdrawn" }),
      e({ code: undefined, status: "graded" }),
    ]);
    expect(taken.has("CS 135")).toBe(true);
    expect(taken.has("CS 136L")).toBe(true);
    expect(taken.has("MATH 999")).toBe(false);
    expect(taken.has("PHYS 111")).toBe(false);
    expect(taken.size).toBe(2);
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
