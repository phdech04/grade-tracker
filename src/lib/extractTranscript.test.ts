import { describe, expect, it } from "vitest";
import { toTranscript, type ExtractedTranscript } from "./extractTranscript";

const raw = (entries: ExtractedTranscript["entries"]): ExtractedTranscript => ({ entries });

describe("toTranscript", () => {
  it("maps a full entry and marks it imported", () => {
    const [e] = toTranscript(
      raw([{ code: "AMATH 250", name: "Diff Eq", term: "Fall 2025", credits: 0.5, grade: 87 }]),
    );
    expect(e.code).toBe("AMATH 250");
    expect(e.name).toBe("Diff Eq");
    expect(e.term).toBe("Fall 2025");
    expect(e.credits).toBe(0.5);
    expect(e.grade).toBe(87);
    expect(e.source).toBe("import");
    expect(e.id).toBeTruthy();
  });

  it("treats grade 0 (CR/NCR/IP placeholder) as ungraded", () => {
    const [e] = toTranscript(raw([{ code: "", name: "Co-op", term: "Spring 2026", credits: 0, grade: 0 }]));
    expect(e.grade).toBeUndefined();
    expect(e.credits).toBeUndefined();
    expect(e.code).toBeUndefined();
  });

  it("drops entries with a blank name", () => {
    const out = toTranscript(
      raw([
        { code: "X", name: "   ", term: "Fall 2025", credits: 0.5, grade: 80 },
        { code: "Y", name: "Real", term: "Fall 2025", credits: 0.5, grade: 90 },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Real");
  });

  it("clamps an out-of-range grade to 100", () => {
    const [e] = toTranscript(raw([{ code: "X", name: "Bonus", term: "Fall 2025", credits: 0.5, grade: 150 }]));
    expect(e.grade).toBe(100);
  });

  it("returns an empty array when there are no entries", () => {
    expect(toTranscript(raw([]))).toEqual([]);
  });
});
