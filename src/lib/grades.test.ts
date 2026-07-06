import { describe, expect, it } from "vitest";
import type { Component, Course, ScoreMode } from "../types";
import { gradeSummary, requiredAverage, totalWeight } from "./grades";

let seq = 0;
const id = () => `id${seq++}`;

function course(scoreMode: ScoreMode, components: Component[]): Course {
  return {
    id: id(),
    name: "Test",
    scoreMode,
    components,
    hurdles: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Helper: a component with N items, each max=max, scores from `scores` (undefined = ungraded). */
function comp(
  name: string,
  weight: number,
  scores: (number | undefined)[],
  max = 100,
  extra: Partial<Component> = {},
): Component {
  return {
    id: id(),
    name,
    weight,
    items: scores.map((s, i) => ({ id: id(), label: `${name} ${i + 1}`, score: s, max })),
    ...extra,
  };
}

const approx = (v: number | null, exp: number, eps = 0.05) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - exp)).toBeLessThan(eps);
};

describe("percentage mode — per-item weights (Statistics shape)", () => {
  // R Assignments 2%x3 (=6), Quizzes 7%x2 (=14), Term Tests 15%x2 (=30), Final 50.
  const make = () =>
    course("percentage", [
      comp("R Assignments", 6, [90, undefined, undefined]),
      comp("Tutorial Quizzes", 14, [undefined, undefined]),
      comp("Term Tests", 30, [80, undefined]),
      comp("Final Exam", 50, [undefined]),
    ]);

  it("weights sum to 100", () => {
    expect(totalWeight(make())).toBe(100);
  });

  it("current standing is over graded work only", () => {
    // earned = .9*2 + .8*15 = 1.8 + 12 = 13.8 ; denom = 2 + 15 = 17
    approx(gradeSummary(make()).current, (13.8 / 17) * 100); // 81.18
  });

  it("weight completed reflects graded slots", () => {
    approx(gradeSummary(make()).weightCompleted, 17);
  });

  it("best case locks graded items at actual scores", () => {
    // R: 1.8 + 2 slots*2 = 5.8 ; Quizzes 14 ; Term: 12 + 15 = 27 ; Final 50 => 96.8
    approx(gradeSummary(make()).bestCase, 96.8);
  });

  it("worst case zeroes remaining work", () => {
    // 1.8 + 12 = 13.8 out of 100
    approx(gradeSummary(make()).worstCase, 13.8);
  });

  it("required average solves for the target", () => {
    const r = requiredAverage(make(), 80);
    // needed = 80 - 13.8 = 66.2 over remaining 83 => 79.76%
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

describe("best-N-of-M (Managerial Accounting shape)", () => {
  it("drops the worst items once all are graded", () => {
    // Weekly Assignments best 9 of 11 = 30%. Nine 100s + two 0s => keeps the nines.
    const scores = [...Array(9).fill(100), 0, 0];
    const c = course("percentage", [
      comp("Weekly Assignments", 30, scores, 100, { drop: { kind: "keepBest", keep: 9 } }),
    ]);
    approx(gradeSummary(c).current, 100);
    approx(gradeSummary(c).weightCompleted, 100);
  });

  it("does not drop early when fewer than keep are graded", () => {
    // 5 graded of 11 (three 100s, two 0s); keep best 9 => nothing dropped yet.
    const scores = [100, 100, 100, 0, 0, ...Array(6).fill(undefined)];
    const c = course("percentage", [
      comp("Weekly Assignments", 30, scores, 100, { drop: { kind: "keepBest", keep: 9 } }),
    ]);
    // earned 3 of 5 graded slots => 60%
    approx(gradeSummary(c).current, 60);
  });
});

describe("points mode + whichever-is-better (AMath shape)", () => {
  // pop quizzes (drop lowest 1), quizzes, then midterm OR final whichever is better.
  const make = (midterm: number | undefined, final: number | undefined) =>
    course("points", [
      comp("Pop Quizzes", 0, [1, 1, 0], 1, { drop: { kind: "dropLowest", dropLowest: 1 } }),
      comp("Quizzes", 0, [2], 3),
      comp("Midterm", 0, [midterm], 10, { linkGroupId: "exam" }),
      comp("Final", 0, [final], 4, { linkGroupId: "exam" }),
    ]);

  it("picks the exam that maximises the grade", () => {
    // pop: keep best 2 of {1,1,0} => 2/2. quizzes 2/3.
    // midterm sel: earned 2+2+8=12 over 2+3+10=15 => 80%
    // final sel:   earned 2+2+3=7  over 2+3+4=9  => 77.8%  -> midterm wins
    approx(gradeSummary(make(8, 3)).current, 80);
  });

  it("switches to the final when it is the better option", () => {
    // midterm 5/10, final 4/4.
    // midterm sel: 2+2+5=9 / 15 = 60% ; final sel: 2+2+4=8 / 9 = 88.9% -> final wins
    approx(gradeSummary(make(5, 4)).current, 88.89);
  });
});

describe("percentage whichever-is-better (linked components share a weight slot)", () => {
  // Assignments 60, then Midterm 40 OR Final 40 (shared 40% slot).
  const make = () =>
    course("percentage", [
      comp("Assignments", 60, [50]),
      comp("Midterm", 40, [90], 100, { linkGroupId: "exam" }),
      comp("Final", 40, [40], 100, { linkGroupId: "exam" }),
    ]);

  it("total weight counts the shared slot once", () => {
    expect(totalWeight(make())).toBe(100);
  });

  it("keeps the higher-scoring linked component", () => {
    // midterm sel: .5*60 + .9*40 = 30+36 = 66 ; final sel: 30+16 = 46 -> 66
    approx(gradeSummary(make()).current, 66);
  });
});

describe("empty / ungraded course", () => {
  it("reports null current grade and no completion", () => {
    const c = course("percentage", [comp("Final", 100, [undefined])]);
    const s = gradeSummary(c);
    expect(s.current).toBeNull();
    expect(s.anyGraded).toBe(false);
    expect(s.weightCompleted).toBe(0);
  });
});
