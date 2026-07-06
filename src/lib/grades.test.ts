import { describe, expect, it } from "vitest";
import type { Component, Course } from "../types";
import { gradeSummary, requiredAverage, totalWeight } from "./grades";

let seq = 0;
const id = () => `id${seq++}`;

function course(components: Component[]): Course {
  return {
    id: id(),
    name: "Test",
    components,
    hurdles: [],
    events: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Helper: a component whose items carry percentage scores (undefined = ungraded). */
function comp(
  name: string,
  weight: number,
  scores: (number | undefined)[],
  extra: Partial<Component> = {},
): Component {
  return {
    id: id(),
    name,
    weight,
    items: scores.map((s, i) => ({ id: id(), label: `${name} ${i + 1}`, score: s })),
    ...extra,
  };
}

const approx = (v: number | null, exp: number, eps = 0.05) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - exp)).toBeLessThan(eps);
};

describe("percentage weights (Statistics shape)", () => {
  // R Assignments 2%x3 (=6), Quizzes 7%x2 (=14), Term Tests 15%x2 (=30), Final 50.
  const make = () =>
    course([
      comp("R Assignments", 6, [90, undefined, undefined]),
      comp("Tutorial Quizzes", 14, [undefined, undefined]),
      comp("Term Tests", 30, [80, undefined]),
      comp("Final Exam", 50, [undefined]),
    ]);

  it("weights sum to 100", () => {
    expect(totalWeight(make())).toBe(100);
  });

  it("current standing is over graded work only", () => {
    // earned = .9*2 + .8*15 = 13.8 ; denom = 2 + 15 = 17
    approx(gradeSummary(make()).current, (13.8 / 17) * 100); // 81.18
  });

  it("weight completed reflects graded slots", () => {
    approx(gradeSummary(make()).weightCompleted, 17);
  });

  it("best case locks graded items at actual scores", () => {
    // R: 1.8 + 2*2 = 5.8 ; Quizzes 14 ; Term: 12 + 15 = 27 ; Final 50 => 96.8
    approx(gradeSummary(make()).bestCase, 96.8);
  });

  it("worst case zeroes remaining work", () => {
    approx(gradeSummary(make()).worstCase, 13.8);
  });

  it("required average solves for the target", () => {
    const r = requiredAverage(make(), 80);
    approx(r.required, 79.76);
    expect(r.status).toBe("achievable");
    approx(r.remainingWeight, 83);
  });

  it("flags impossible targets", () => {
    expect(requiredAverage(make(), 99).status).toBe("impossible");
  });

  it("flags already-guaranteed targets", () => {
    expect(requiredAverage(make(), 10).status).toBe("guaranteed");
  });
});

describe("weights are unit-agnostic (points-style schemes normalize)", () => {
  it("a course whose weights sum to 50 grades identically to the same shape scaled to 100", () => {
    const half = course([comp("Quizzes", 20, [80, 60]), comp("Final", 30, [undefined])]);
    const full = course([comp("Quizzes", 40, [80, 60]), comp("Final", 60, [undefined])]);
    approx(gradeSummary(half).current, gradeSummary(full).current as number);
    approx(gradeSummary(half).bestCase, gradeSummary(full).bestCase);
    approx(gradeSummary(half).worstCase, gradeSummary(full).worstCase);
  });

  it("normalized component weight is reported as % of the course", () => {
    const c = course([comp("Quizzes", 20, [80, 60]), comp("Final", 30, [undefined])]);
    const s = gradeSummary(c);
    approx(s.components[0].weight, 40);
    approx(s.components[1].weight, 60);
  });
});

describe("best-N-of-M (Managerial Accounting shape)", () => {
  it("drops the worst items once all are graded", () => {
    const scores = [...Array(9).fill(100), 0, 0];
    const c = course([
      comp("Weekly Assignments", 30, scores, { drop: { kind: "keepBest", keep: 9 } }),
    ]);
    approx(gradeSummary(c).current, 100);
    approx(gradeSummary(c).weightCompleted, 100);
  });

  it("does not drop early when fewer than keep are graded", () => {
    const scores = [100, 100, 100, 0, 0, ...Array(6).fill(undefined)];
    const c = course([
      comp("Weekly Assignments", 30, scores, { drop: { kind: "keepBest", keep: 9 } }),
    ]);
    approx(gradeSummary(c).current, 60);
  });
});

describe("whichever-is-better link groups (AMath shape, migrated)", () => {
  // v1 points shapes converted to v2: pop quizzes weight 2 (2 counting slots x 1pt),
  // quizzes weight 3, midterm weight 10, final weight 4.
  const make = (midterm: number | undefined, final: number | undefined) =>
    course([
      comp("Pop Quizzes", 2, [100, 100, 0], { drop: { kind: "dropLowest", dropLowest: 1 } }),
      comp("Quizzes", 3, [66.6667]),
      comp("Midterm", 10, [midterm], { linkGroupId: "exam" }),
      comp("Final", 4, [final], { linkGroupId: "exam" }),
    ]);

  it("picks the exam that maximises the grade", () => {
    // midterm sel: 2 + 2 + 8 = 12 over 15 => 80% ; final sel: 7/9 => 77.8%
    approx(gradeSummary(make(80, 75)).current, 80);
  });

  it("switches to the final when it is the better option", () => {
    // midterm 50% => 9/15 = 60% ; final 100% => 8/9 = 88.9%
    approx(gradeSummary(make(50, 100)).current, 88.89);
  });

  it("exposes which components are counting", () => {
    const s = gradeSummary(make(80, 75));
    const names = s.components
      .filter((cs) => s.countingIds.includes(cs.component.id))
      .map((cs) => cs.component.name);
    expect(names).toContain("Midterm");
    expect(names).not.toContain("Final");
  });

  it("counts the graded member, not a still-blank sibling, even when the blank one would raise the blended average", () => {
    // Assignments is acing at 100%, so blending in the (lower-scoring)
    // Midterm pulls the average down. A naive "maximise the blended ratio"
    // selection would rather count nothing (pick the still-ungraded Final)
    // than count the entered midterm score. The graded entry should win.
    const c = course([
      comp("Assignments", 60, [100]),
      comp("Midterm", 20, [80], { linkGroupId: "exam" }),
      comp("Final", 20, [undefined], { linkGroupId: "exam" }),
    ]);
    const s = gradeSummary(c);
    const names = s.components
      .filter((cs) => s.countingIds.includes(cs.component.id))
      .map((cs) => cs.component.name);
    expect(names).toContain("Midterm");
    expect(names).not.toContain("Final");
    approx(s.current, 95); // (60 + 0.8*20) / (60 + 20)
  });
});

describe("percentage whichever-is-better (linked components share a weight slot)", () => {
  const make = () =>
    course([
      comp("Assignments", 60, [50]),
      comp("Midterm", 40, [90], { linkGroupId: "exam" }),
      comp("Final", 40, [40], { linkGroupId: "exam" }),
    ]);

  it("total weight counts the shared slot once", () => {
    expect(totalWeight(make())).toBe(100);
  });

  it("keeps the higher-scoring linked component", () => {
    approx(gradeSummary(make()).current, 66);
  });
});

describe("bonus scores above 100", () => {
  it("carries the bonus through the earned weight", () => {
    const c = course([comp("Quiz", 50, [110]), comp("Final", 50, [undefined])]);
    approx(gradeSummary(c).current, 110);
    approx(gradeSummary(c).bestCase, 105);
  });
});

describe("empty / ungraded course", () => {
  it("reports null current grade and no completion", () => {
    const c = course([comp("Final", 100, [undefined])]);
    const s = gradeSummary(c);
    expect(s.current).toBeNull();
    expect(s.anyGraded).toBe(false);
    expect(s.weightCompleted).toBe(0);
  });
});
