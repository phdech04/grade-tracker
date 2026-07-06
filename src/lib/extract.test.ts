import { describe, expect, it } from "vitest";
import type { Course } from "../types";
import { applyConfirmations, type Confirmation } from "./extract";

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
