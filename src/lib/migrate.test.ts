import { describe, expect, it } from "vitest";
import { gradeSummary } from "./grades";
import { migrateV1, type AppDataV1, type CourseV1 } from "./migrate";

const base = { hurdles: [], createdAt: 0, updatedAt: 0 };

function wrap(course: CourseV1): AppDataV1 {
  return { version: 1, courses: [course] };
}

describe("migrateV1", () => {
  it("converts percentage-mode scores to percentages and keeps weights", () => {
    const v1: CourseV1 = {
      ...base,
      id: "c1",
      name: "Stats",
      scoreMode: "percentage",
      components: [
        {
          id: "a",
          name: "Assignments",
          weight: 40,
          items: [
            { id: "i1", label: "A1", score: 45, max: 50 },
            { id: "i2", label: "A2", max: 50 },
          ],
        },
      ],
    };
    const out = migrateV1(wrap(v1));
    expect(out.version).toBe(2);
    const c = out.courses[0].components[0];
    expect(c.weight).toBe(40);
    expect(c.items[0].score).toBeCloseTo(90);
    expect(c.items[1].score).toBeUndefined();
    expect("max" in c.items[0]).toBe(false);
  });

  it("preserves the grade of a points-mode course exactly (AMATH shape)", () => {
    const v1: CourseV1 = {
      ...base,
      id: "c2",
      name: "AMATH 250",
      scoreMode: "points",
      components: [
        {
          id: "pop",
          name: "Pop Quizzes",
          weight: 0,
          drop: { kind: "dropLowest", dropLowest: 2 },
          items: [
            { id: "p1", label: "Pop 1", score: 0.83, max: 1 },
            { id: "p2", label: "Pop 2", score: 1, max: 1 },
            { id: "p3", label: "Pop 3", score: 1, max: 1 },
            { id: "p4", label: "Pop 4", score: 1, max: 1 },
          ],
        },
        {
          id: "quiz",
          name: "Quizzes",
          weight: 0,
          items: [
            { id: "q1", label: "Q1", score: 1.5, max: 3 },
            { id: "q2", label: "Q2", score: 2.79, max: 3 },
            { id: "q3", label: "Q3", score: 2.55, max: 3 },
            { id: "q4", label: "Q4", score: 2.7, max: 3 },
            { id: "q5", label: "Q5", max: 3 },
          ],
        },
        {
          id: "mid",
          name: "Midterm",
          weight: 0,
          items: [{ id: "m1", label: "Midterm", max: 27.5 }],
        },
      ],
    };
    // v1 grade over graded work: pop keeps best 2 = (1+1)/2 ; quizzes = 9.54/12 ;
    // midterm ungraded. earned = 2 + 9.54 = 11.54 over 2 + 12 = 14.
    const out = migrateV1(wrap(v1));
    const s = gradeSummary(out.courses[0]);
    expect(s.current).toBeCloseTo((11.54 / 14) * 100, 5);
    // full denominator preserved: pop 2 slots x1 + quizzes 5x3 + midterm 27.5 = 44.5
    expect(out.courses[0].components[0].weight).toBeCloseTo(2);
    expect(out.courses[0].components[1].weight).toBeCloseTo(15);
    expect(out.courses[0].components[2].weight).toBeCloseTo(27.5);
  });

  it("drops needsReview and scoreMode, keeps link groups and metadata", () => {
    const v1: CourseV1 = {
      ...base,
      id: "c3",
      name: "AM",
      code: "AM 101",
      term: "Fall 2026",
      targetGrade: 85,
      notes: "hi",
      scoreMode: "percentage",
      components: [
        {
          id: "x",
          name: "Midterm",
          weight: 40,
          linkGroupId: "exam",
          needsReview: "estimated",
          items: [{ id: "i", label: "Midterm", max: 100 }],
        },
      ],
    };
    const out = migrateV1(wrap(v1));
    const course = out.courses[0];
    expect(course.code).toBe("AM 101");
    expect(course.targetGrade).toBe(85);
    const c = course.components[0];
    expect(c.linkGroupId).toBe("exam");
    expect("needsReview" in c).toBe(false);
  });
});
