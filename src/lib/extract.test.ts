import { describe, expect, it } from "vitest";
import type { Course } from "../types";
import { applyConfirmations, toResult, type Confirmation, type Extracted } from "./extract";

function course(): Course {
  return {
    id: "c",
    name: "Test",
    components: [
      {
        id: "pop",
        name: "Pop Quizzes",
        weight: 12,
        items: Array.from({ length: 8 }, (_, i) => ({
          id: `p${i}`,
          label: `Pop Quizzes ${i + 1}`,
        })),
      },
      { id: "mid", name: "Midterm", weight: 30, items: [{ id: "m", label: "Midterm" }] },
    ],
    hurdles: [],
    events: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

const conf = (p: Partial<Confirmation>): Confirmation => ({
  id: "k",
  componentIndex: 0,
  field: "itemCount",
  question: "?",
  suggestion: 8,
  choices: [],
  ...p,
});

describe("applyConfirmations", () => {
  it("regenerates the item list to the confirmed count", () => {
    const out = applyConfirmations(course(), [conf({ id: "a", suggestion: 8 })], { a: 10 });
    expect(out.components[0].items).toHaveLength(10);
    expect(out.components[0].items[9].label).toBe("Pop Quizzes 10");
    // existing items keep their ids
    expect(out.components[0].items[0].id).toBe("p0");
  });

  it("shrinks the item list when the confirmed count is lower", () => {
    const out = applyConfirmations(course(), [conf({ id: "a" })], { a: 4 });
    expect(out.components[0].items).toHaveLength(4);
  });

  it("overwrites the weight for weight confirmations", () => {
    const out = applyConfirmations(
      course(),
      [conf({ id: "w", componentIndex: 1, field: "weight", suggestion: 30, choices: [30, 35] })],
      { w: 35 },
    );
    expect(out.components[1].weight).toBe(35);
  });

  it("ignores notes, unknown indices, and missing answers", () => {
    const before = course();
    const out = applyConfirmations(
      before,
      [
        conf({ id: "n", componentIndex: null, field: "note", suggestion: 0 }),
        conf({ id: "x", componentIndex: 9 }),
        conf({ id: "m", componentIndex: 0 }),
      ],
      {},
    );
    expect(out.components[0].items).toHaveLength(8);
    expect(out.components[1].weight).toBe(30);
  });
});

const extracted = (p: Partial<Extracted> = {}): Extracted => ({
  name: "Course",
  code: "",
  term: "Fall 2026",
  components: [],
  assessments: [],
  confirmations: [],
  hurdles: [],
  notes: "",
  ...p,
});

const asmt = (p: Partial<Extracted["assessments"][number]> = {}) => ({
  title: "Assignment 1",
  kind: "assignment",
  dueDate: "",
  dueRaw: "",
  weight: 0,
  componentName: "",
  ...p,
});

describe("toResult — assessments → CourseEvent[]", () => {
  it("maps a resolved ISO date and drops the raw phrase", () => {
    const { course } = toResult(
      extracted({ assessments: [asmt({ dueDate: "2026-10-14", dueRaw: "Oct 14" })] }),
    );
    expect(course.events).toHaveLength(1);
    const e = course.events[0];
    expect(e.due).toBe("2026-10-14");
    expect(e.dueRaw).toBeUndefined();
    expect(e.source).toBe("outline");
  });

  it("keeps the raw phrase when no concrete date resolved", () => {
    const { course } = toResult(
      extracted({ assessments: [asmt({ title: "Lab 3", dueDate: "", dueRaw: "Week 6" })] }),
    );
    expect(course.events[0].due).toBeUndefined();
    expect(course.events[0].dueRaw).toBe("Week 6");
  });

  it("treats a non-ISO dueDate as unresolved and preserves the raw phrase", () => {
    const { course } = toResult(
      extracted({ assessments: [asmt({ dueDate: "Oct 14", dueRaw: "Oct 14" })] }),
    );
    expect(course.events[0].due).toBeUndefined();
    expect(course.events[0].dueRaw).toBe("Oct 14");
  });

  it("soft-links to a grading component by case-insensitive name", () => {
    const { course } = toResult(
      extracted({
        components: [
          { name: "Assignments", weight: 40, itemCount: 3, dropKind: "none", dropCount: 0, linkGroupId: "" },
        ],
        assessments: [asmt({ componentName: "assignments" })],
      }),
    );
    const compId = course.components[0].id;
    expect(course.events[0].componentId).toBe(compId);
  });

  it("leaves componentId undefined when the name matches nothing", () => {
    const { course } = toResult(extracted({ assessments: [asmt({ componentName: "Nonexistent" })] }));
    expect(course.events[0].componentId).toBeUndefined();
  });

  it("normalizes unknown kinds to 'other' and keeps valid ones", () => {
    const { course } = toResult(
      extracted({
        assessments: [asmt({ kind: "midterm" }), asmt({ title: "Final", kind: "exam" })],
      }),
    );
    expect(course.events[0].kind).toBe("other");
    expect(course.events[1].kind).toBe("exam");
  });

  it("keeps a positive weight and drops zero", () => {
    const { course } = toResult(
      extracted({ assessments: [asmt({ weight: 15 }), asmt({ title: "Quiz", weight: 0 })] }),
    );
    expect(course.events[0].weight).toBe(15);
    expect(course.events[1].weight).toBeUndefined();
  });

  it("drops assessments with a blank title", () => {
    const { course } = toResult(
      extracted({ assessments: [asmt({ title: "  " }), asmt({ title: "Real" })] }),
    );
    expect(course.events).toHaveLength(1);
    expect(course.events[0].title).toBe("Real");
  });

  it("produces an empty events array when there are no assessments", () => {
    const { course } = toResult(extracted());
    expect(course.events).toEqual([]);
  });
});
