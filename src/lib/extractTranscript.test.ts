import { describe, expect, it } from "vitest";
import { classifyGrade, toTranscript, type ExtractedTranscript } from "./extractTranscript";

const raw = (entries: ExtractedTranscript["entries"]): ExtractedTranscript => ({ entries });

describe("classifyGrade", () => {
  it("classifies numbers, CR/NCR/WD, and blank tokens", () => {
    expect(classifyGrade("87")).toEqual({ status: "graded", grade: 87 });
    expect(classifyGrade("CR")).toEqual({ status: "credit" });
    expect(classifyGrade("NCR")).toEqual({ status: "no-credit" });
    expect(classifyGrade("WD")).toEqual({ status: "withdrawn" });
    expect(classifyGrade("")).toEqual({ status: "in-progress" });
    expect(classifyGrade("  ")).toEqual({ status: "in-progress" });
    expect(classifyGrade("IP")).toEqual({ status: "in-progress" });
  });

  it("clamps graded values to 0–100", () => {
    expect(classifyGrade("150")).toEqual({ status: "graded", grade: 100 });
  });
});

describe("toTranscript", () => {
  it("maps a graded course", () => {
    const [e] = toTranscript(
      raw([{ code: "AMATH 250", name: "Diff Eq", term: "Fall 2025", credits: 0.5, grade: "87" }]),
    );
    expect(e.code).toBe("AMATH 250");
    expect(e.status).toBe("graded");
    expect(e.grade).toBe(87);
    expect(e.credits).toBe(0.5);
    expect(e.source).toBe("import");
  });

  it("maps CR / in-progress with no numeric grade", () => {
    const out = toTranscript(
      raw([
        { code: "CS 136L", name: "Tools", term: "Winter 2025", credits: 0.25, grade: "CR" },
        { code: "AMATH 250", name: "Diff Eq", term: "Spring 2026", credits: 0.5, grade: "" },
      ]),
    );
    expect(out[0].status).toBe("credit");
    expect(out[0].grade).toBeUndefined();
    expect(out[1].status).toBe("in-progress");
    expect(out[1].grade).toBeUndefined();
  });

  it("drops entries with a blank name", () => {
    const out = toTranscript(
      raw([
        { code: "X", name: "  ", term: "Fall 2025", credits: 0.5, grade: "80" },
        { code: "Y", name: "Real", term: "Fall 2025", credits: 0.5, grade: "90" },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Real");
  });

  it("returns an empty array when there are no entries", () => {
    expect(toTranscript(raw([]))).toEqual([]);
  });
});
