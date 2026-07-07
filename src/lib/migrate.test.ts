import { describe, expect, it } from "vitest";
import { gradeSummary } from "./grades";
import {
  migrateV1,
  migrateV2,
  migrateV3,
  migrateV4,
  type AppDataV1,
  type AppDataV2,
  type AppDataV3,
  type AppDataV4,
  type CourseV1,
  type CourseV2,
} from "./migrate";
import type { Course } from "../types";

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
    // Migrated all the way to v3 so gradeSummary sees a current-shape Course.
    const out = migrateV2(migrateV1(wrap(v1)));
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

describe("migrateV2", () => {
  const v2Course: CourseV2 = {
    id: "c",
    name: "Stats",
    code: "STAT 101",
    term: "Fall 2026",
    targetGrade: 85,
    credits: 0.5,
    components: [
      {
        id: "a",
        name: "Assignments",
        weight: 40,
        items: [
          { id: "i1", label: "A1", score: 90 },
          { id: "i2", label: "A2" },
        ],
      },
      { id: "f", name: "Final", weight: 60, items: [{ id: "f1", label: "Final" }] },
    ],
    hurdles: [{ id: "h", description: "Pass the final" }],
    notes: "keep me",
    createdAt: 7,
    updatedAt: 9,
  };
  const wrap2 = (c: CourseV2): AppDataV2 => ({ version: 2, courses: [c] });

  it("bumps the version and gives every course an empty events array", () => {
    const out = migrateV2(wrap2(v2Course));
    expect(out.version).toBe(3);
    expect(out.courses[0].events).toEqual([]);
  });

  it("preserves all existing fields and the computed grade untouched", () => {
    const before = gradeSummary({ ...v2Course, events: [] });
    const out = migrateV2(wrap2(v2Course));
    const c = out.courses[0];
    expect(c.code).toBe("STAT 101");
    expect(c.credits).toBe(0.5);
    expect(c.hurdles).toHaveLength(1);
    expect(c.notes).toBe("keep me");
    expect(c.createdAt).toBe(7);
    expect(gradeSummary(c).current).toBe(before.current);
  });
});

describe("migrateV3", () => {
  const course: Course = {
    id: "c",
    name: "Stats",
    components: [{ id: "a", name: "A", weight: 100, items: [{ id: "i", label: "A1", score: 82 }] }],
    hurdles: [],
    events: [{ id: "e", title: "A1", kind: "assignment", due: "2026-01-10", source: "outline" }],
    createdAt: 3,
    updatedAt: 4,
  };
  const v3: AppDataV3 = { version: 3, courses: [course] };

  it("bumps to v4 and adds an empty top-level transcript", () => {
    const out = migrateV3(v3);
    expect(out.version).toBe(4);
    expect(out.transcript).toEqual([]);
  });

  it("leaves courses (and their grades and events) untouched", () => {
    const before = gradeSummary(course).current;
    const out = migrateV3(v3);
    expect(out.courses).toHaveLength(1);
    expect(out.courses[0].events).toHaveLength(1);
    expect(gradeSummary(out.courses[0]).current).toBe(before);
  });
});

describe("migrateV4", () => {
  const v4: AppDataV4 = {
    version: 4,
    courses: [],
    transcript: [
      { id: "a", name: "Graded", term: "Fall 2025", credits: 0.5, grade: 88, source: "import" },
      { id: "b", name: "No grade", term: "Spring 2026", credits: 0.5, source: "import" },
    ],
  };

  it("bumps to v5 and derives a status per entry", () => {
    const out = migrateV4(v4);
    expect(out.version).toBe(5);
    expect(out.transcript[0].status).toBe("graded"); // had a number
    expect(out.transcript[1].status).toBe("in-progress"); // had no grade
  });

  it("preserves the other entry fields", () => {
    const out = migrateV4(v4);
    expect(out.transcript[0].grade).toBe(88);
    expect(out.transcript[0].credits).toBe(0.5);
    expect(out.transcript[1].name).toBe("No grade");
  });
});
