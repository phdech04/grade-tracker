# Tally General Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the grade model to percent-only entry with a single weight number, add a view/edit split to the course page, import-time ambiguity confirmations, a dashboard term overview, and remove letter grades — per the approved spec at `docs/superpowers/specs/2026-07-05-general-sweep-design.md`.

**Architecture:** Data model v2 (`Item.score` is a percentage; `Component.weight` is a unit-agnostic number; no `scoreMode`, no `Item.max`, no `needsReview`) with an automatic, grade-preserving v1→v2 localStorage migration. The engine keeps its slot model, drop rules, and link groups but loses the points-mode branch. UI: course page gains a page-level `editing` state gating all structural controls; import review gains a structured-confirmation step; dashboard gains a term summary strip.

**Tech Stack:** React 19 + TypeScript, Vite 8, Tailwind 3 (custom utility classes `card`, `btn-ghost`, `btn-accent`, `btn-primary`, `field`, `label` in `src/index.css`), vitest 4 (`npm test`), Vercel serverless `/api/extract` calling Gemini.

## Global Constraints

- Percentages are the only grade language — no letter grades, no GPA anywhere.
- Item scores: any non-negative number; above 100 = bonus; empty input = ungraded (`score: undefined`).
- Weights are unit-agnostic; the engine normalizes (`grade = earned / denom`). The UI shows normalized share when a course's `totalWeight` differs from 100 by ≥ 0.5.
- localStorage key stays `"grade-tracker:data:v1"` (it's a storage location, not a schema version; the `version` field inside distinguishes v1/v2).
- Migration must preserve grades exactly for components with uniform item maxes.
- **Expected red build window:** after Task 1, `npm run build` (tsc) fails on not-yet-updated UI files until Task 8 completes. Each task's gate is `npm test` (must be green) plus the task's own checks. Task 9 restores and verifies the full `build`/`lint`/`test` gates.
- Commit after every task (steps below include the commands).
- Reference: current file versions are at git baseline commit `8f3e5f4`.

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/types.ts` | rewrite | v2 data model |
| `src/lib/grades.ts` | rewrite | percent-only engine; exposes `countingIds` for better-of ✓ |
| `src/lib/grades.test.ts` | rewrite | engine tests for v2 |
| `src/lib/migrate.ts` | create | v1→v2 migration (pure functions) |
| `src/lib/migrate.test.ts` | create | migration preservation tests |
| `src/lib/storage.ts` | modify | version-2 load/save; migrate v1 on load and on backup import |
| `src/lib/format.ts` | modify | delete `letterGrade` |
| `src/components/GradeRing.tsx` | modify | `%` caption instead of letter |
| `src/components/ComponentCard.tsx` | create | one component card, view + edit rendering, better-of picker |
| `src/components/CourseDetail.tsx` | rewrite | page edit mode, static header, link-group blocks, hurdles, delete-at-bottom, sidebar |
| `src/components/Dashboard.tsx` | modify | term summary strip; hero only when empty |
| `src/lib/extract.ts` | rewrite | v2 extraction mapping, `Confirmation` type, `applyConfirmations` |
| `src/lib/extract.test.ts` | create | `applyConfirmations` tests |
| `api/extract.ts` | modify | v2 prompt + response schema (weight-only, confirmations) |
| `src/components/ImportReview.tsx` | modify | "Confirm these" block; applies answers on save |
| `src/App.tsx` | modify | `blankCourse()` loses `scoreMode` |

---

### Task 1: Data model v2 + engine rewrite

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/grades.ts`
- Modify: `src/lib/grades.test.ts`
- Modify: `src/App.tsx:11-21` (blankCourse)

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: types `Item { id, label, score? }`, `Component { id, name, weight, items, drop?, linkGroupId? }`, `Course` (adds `credits?: number`, drops `scoreMode`), `AppData { version: 2 }`. Engine exports (unchanged names): `isEntered(item)`, `countTarget(drop, n)`, `gradeSummary(course): GradeSummary`, `requiredAverage(course, target)`, `totalWeight(course)`. **New:** `GradeSummary.countingIds: string[]` — ids of components chosen by the current-standing aggregate (standalone + winning link-group members). `ComponentSummary` keeps `{ component, currentFraction, gradedCount, totalItems, countedItems, weight, earnedWeight }` where `weight` is the normalized % share.

- [ ] **Step 1: Rewrite the engine tests for the v2 model (failing first)**

Replace the full contents of `src/lib/grades.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — type errors (`scoreMode` missing from test `course()` objects is gone but `Course` still requires it; `Item.max` missing) and `countingIds` not on `GradeSummary`.

- [ ] **Step 3: Rewrite `src/types.ts`**

Replace the full contents with:

```ts
// Core data model for the grade tracker.
//
// One normalized shape covers every grading scheme we saw in real outlines:
//   - simple weighted components (Final 50%)
//   - per-item categories (R Assignments 2% each x3)
//   - drop-lowest / best-N-of-M (best 9 of 11)
//   - "whichever is better" between components (midterm vs final) via linkGroupId
//   - points-based schemes (weights are unit-agnostic; only ratios matter)

export interface Item {
  id: string;
  label: string;
  /** Percentage earned on this item (88 = 88%). >100 allowed (bonus). undefined = ungraded. */
  score?: number;
}

/** best-of: keep the top `keep` items. drop-lowest: drop the worst `dropLowest`. */
export type DropRule =
  | { kind: "keepBest"; keep: number }
  | { kind: "dropLowest"; dropLowest: number };

export interface Component {
  id: string;
  name: string;
  /**
   * This component's share of the final grade, in whatever unit the syllabus
   * uses (percent or points). The engine normalizes — only ratios matter.
   */
  weight: number;
  items: Item[];
  /** Optional best-of / drop-lowest rule applied across this component's items. */
  drop?: DropRule;
  /**
   * Components that share a linkGroupId form a "whichever is better" group:
   * only the member currently scoring higher counts. undefined => standalone.
   */
  linkGroupId?: string;
}

export interface Hurdle {
  id: string;
  /** e.g. "You must pass the final exam to pass the course." */
  description: string;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  term?: string;
  /** Desired final grade, e.g. 85. */
  targetGrade?: number;
  /** Optional credit weight used by the term average. */
  credits?: number;
  components: Component[];
  hurdles: Hurdle[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  version: 2;
  courses: Course[];
}
```

- [ ] **Step 4: Rewrite `src/lib/grades.ts`**

Replace the full contents with:

```ts
import type { Component, Course, DropRule, Item } from "../types";

// ---------------------------------------------------------------------------
// Grade engine
//
// Every component contributes some amount of EARNED weight out of a
// DENOMINATOR of weight; the final grade is earned / denom. A component's
// weight is split evenly across the items that count (weight / countTarget
// per slot) and a graded item earns (score / 100) of its slot. Weights are
// unit-agnostic — percent and points schemes reduce to the same ratios.
//
// Drop rules (best-N-of-M, drop-lowest) pick which items count. "Whichever is
// better" link groups are resolved by trying each member and keeping the
// selection that yields the highest grade.
// ---------------------------------------------------------------------------

export function isEntered(item: Item): boolean {
  return item.score !== undefined && item.score !== null && !Number.isNaN(item.score);
}

/** How many items in a component ultimately count toward the grade. */
export function countTarget(drop: DropRule | undefined, n: number): number {
  if (!drop) return n;
  if (drop.kind === "keepBest") return Math.min(drop.keep, n);
  return Math.max(0, n - drop.dropLowest);
}

type Fill = number | "graded";

interface Contribution {
  earned: number; // weight units
  denom: number; // weight units
  gradedCount: number;
  countedGradedCount: number;
  totalCounted: number;
  /** Average fraction (0..1+) of the counted graded items, or null if none. */
  currentFraction: number | null;
}

/**
 * Compute one component's contribution.
 * @param fill  "graded" => only count graded items (current standing).
 *              number    => fill remaining counting slots at this fraction
 *                           (projection / best / worst case).
 */
function contribution(component: Component, fill: Fill): Contribution {
  const n = component.items.length;
  const target = countTarget(component.drop, n);

  const graded = component.items.filter(isEntered);
  // Rank graded items best-first, so drop rules drop the worst.
  const fracs = graded.map((it) => it.score! / 100).sort((a, b) => b - a);
  const kept = fracs.slice(0, Math.min(target, fracs.length));

  const perSlot = target > 0 ? component.weight / target : 0;
  let earned = 0;
  for (const f of kept) earned += f * perSlot;
  const denomGraded = kept.length * perSlot;
  const currentFraction = denomGraded > 0 ? earned / denomGraded : null;

  if (fill === "graded") {
    return {
      earned,
      denom: denomGraded,
      gradedCount: graded.length,
      countedGradedCount: kept.length,
      totalCounted: target,
      currentFraction,
    };
  }

  // Full-course view: fill the remaining counting slots at `fill` fraction.
  const remaining = Math.max(0, target - kept.length);
  return {
    earned: earned + remaining * fill * perSlot,
    denom: denomGraded + remaining * perSlot,
    gradedCount: graded.length,
    countedGradedCount: kept.length,
    totalCounted: target,
    currentFraction,
  };
}

interface LinkGroup {
  id: string;
  members: Component[];
}

function partition(course: Course): { standalone: Component[]; groups: LinkGroup[] } {
  const standalone: Component[] = [];
  const groupMap = new Map<string, Component[]>();
  for (const c of course.components) {
    if (c.linkGroupId) {
      const arr = groupMap.get(c.linkGroupId) ?? [];
      arr.push(c);
      groupMap.set(c.linkGroupId, arr);
    } else {
      standalone.push(c);
    }
  }
  const groups: LinkGroup[] = [];
  for (const [id, members] of groupMap) {
    if (members.length === 1) standalone.push(members[0]);
    else groups.push({ id, members });
  }
  return { standalone, groups };
}

/** Cartesian product of one chosen member index per group. */
function selections(groups: LinkGroup[]): number[][] {
  let combos: number[][] = [[]];
  for (const g of groups) {
    const next: number[][] = [];
    for (const combo of combos) {
      for (let i = 0; i < g.members.length; i++) next.push([...combo, i]);
    }
    combos = next;
  }
  return combos;
}

interface AggregateResult {
  earned: number;
  denom: number;
  chosen: Component[]; // standalone + selected group members
}

/**
 * Aggregate the course under a fill strategy, choosing link-group members to
 * MAXIMISE the resulting grade ("whichever is better").
 */
function aggregate(course: Course, fill: (c: Component) => Fill): AggregateResult {
  const { standalone, groups } = partition(course);

  let baseEarned = 0;
  let baseDenom = 0;
  for (const c of standalone) {
    const r = contribution(c, fill(c));
    baseEarned += r.earned;
    baseDenom += r.denom;
  }

  let best: AggregateResult | null = null;
  for (const sel of selections(groups)) {
    let earned = baseEarned;
    let denom = baseDenom;
    const chosen = [...standalone];
    sel.forEach((memberIdx, gi) => {
      const member = groups[gi].members[memberIdx];
      const r = contribution(member, fill(member));
      earned += r.earned;
      denom += r.denom;
      chosen.push(member);
    });
    const pct = denom > 0 ? earned / denom : 0;
    const bestPct = best && best.denom > 0 ? best.earned / best.denom : -Infinity;
    if (!best || pct > bestPct) best = { earned, denom, chosen };
  }

  return best ?? { earned: baseEarned, denom: baseDenom, chosen: standalone };
}

export interface ComponentSummary {
  component: Component;
  currentFraction: number | null; // 0..1+ over graded counted items
  gradedCount: number;
  totalItems: number;
  countedItems: number;
  weight: number; // normalized share of the final grade in %
  earnedWeight: number; // % points earned so far from this component
}

export interface GradeSummary {
  /** Grade over the work graded so far, as a %. null if nothing graded. */
  current: number | null;
  /** % of the final grade that is already locked in (graded). */
  weightCompleted: number;
  /** Projected final grade if remaining work matches current averages. */
  projected: number | null;
  /** Best achievable final grade (100% on everything remaining). */
  bestCase: number;
  /** Worst final grade (0% on everything remaining). */
  worstCase: number;
  components: ComponentSummary[];
  /** Ids of components counting right now (standalone + winning link-group members). */
  countingIds: string[];
  anyGraded: boolean;
}

export function gradeSummary(course: Course): GradeSummary {
  const graded = aggregate(course, () => "graded");
  const current = graded.denom > 0 ? (graded.earned / graded.denom) * 100 : null;
  const currentFrac = current === null ? 0 : current / 100;

  // Full-course denominators under the best selection (use best-case fill so
  // every counting slot is included regardless of current scores).
  const full = aggregate(course, () => 1);
  const weightCompleted = full.denom > 0 ? (graded.denom / full.denom) * 100 : 0;

  const projectedAgg = aggregate(course, (c) => {
    const r = contribution(c, "graded");
    return r.currentFraction ?? currentFrac;
  });
  const projected = projectedAgg.denom > 0 ? (projectedAgg.earned / projectedAgg.denom) * 100 : null;

  const bestCase = full.denom > 0 ? (full.earned / full.denom) * 100 : 0;
  const worstAgg = aggregate(course, () => 0);
  const worstCase = worstAgg.denom > 0 ? (worstAgg.earned / worstAgg.denom) * 100 : 0;

  // Per-component summaries for display (weights normalised to % of course).
  const fullDenom = full.denom || 1;
  const components: ComponentSummary[] = course.components.map((c) => {
    const r = contribution(c, "graded");
    const fullC = contribution(c, 1);
    return {
      component: c,
      currentFraction: r.currentFraction,
      gradedCount: r.gradedCount,
      totalItems: c.items.length,
      countedItems: r.totalCounted,
      weight: (fullC.denom / fullDenom) * 100,
      earnedWeight: (r.earned / fullDenom) * 100,
    };
  });

  return {
    current,
    weightCompleted,
    projected,
    bestCase,
    worstCase,
    components,
    countingIds: graded.chosen.map((c) => c.id),
    anyGraded: graded.denom > 0,
  };
}

export type RequiredStatus = "achievable" | "guaranteed" | "impossible" | "complete";

export interface RequiredResult {
  /** Average fraction needed on remaining counting work, as a % (0..100+). */
  required: number;
  status: RequiredStatus;
  remainingWeight: number; // % of final grade still open
}

/**
 * What average is needed on the remaining work to finish at `target` %?
 * Uses the link-group selection that maximises the projected grade.
 */
export function requiredAverage(course: Course, target: number): RequiredResult {
  const projectedAgg = aggregate(course, (c) => {
    const r = contribution(c, "graded");
    return r.currentFraction ?? 0;
  });
  const chosen = projectedAgg.chosen;

  let earnedGraded = 0;
  let totalDenom = 0;
  let remainingDenom = 0;
  for (const c of chosen) {
    const g = contribution(c, "graded");
    const full = contribution(c, 1);
    earnedGraded += g.earned;
    totalDenom += full.denom;
    remainingDenom += full.denom - g.denom;
  }

  const remainingWeight = totalDenom > 0 ? (remainingDenom / totalDenom) * 100 : 0;

  if (remainingDenom <= 1e-9) {
    return { required: 0, status: "complete", remainingWeight: 0 };
  }

  const targetFrac = target / 100;
  const neededEarned = targetFrac * totalDenom - earnedGraded;
  const requiredFrac = neededEarned / remainingDenom;
  const required = requiredFrac * 100;

  let status: RequiredStatus;
  if (requiredFrac <= 0) status = "guaranteed";
  else if (requiredFrac > 1) status = "impossible";
  else status = "achievable";

  return { required, status, remainingWeight };
}

/** Total declared weight, counting each link group's shared slot once. */
export function totalWeight(course: Course): number {
  const { standalone, groups } = partition(course);
  let sum = standalone.reduce((s, c) => s + (c.weight || 0), 0);
  for (const g of groups) sum += g.members[0]?.weight || 0;
  return sum;
}
```

- [ ] **Step 5: Fix `blankCourse()` in `src/App.tsx`**

In `src/App.tsx`, remove the `scoreMode` line from `blankCourse()`:

```ts
function blankCourse(): Course {
  return {
    id: uid(),
    name: "New course",
    components: [],
    hurdles: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites in `src/lib/grades.test.ts` green. (`npm run build` is expected to fail from here until Task 8 — UI files still reference v1 fields.)

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/grades.ts src/lib/grades.test.ts src/App.tsx
git commit -m "feat: data model v2 — percent-only items, unit-agnostic weights"
```

---

### Task 2: v1→v2 migration + storage

**Files:**
- Create: `src/lib/migrate.ts`
- Create: `src/lib/migrate.test.ts`
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Consumes: `countTarget` from `src/lib/grades.ts`; v2 types from `src/types.ts`.
- Produces: `migrateV1(data: AppDataV1): AppData` and exported types `AppDataV1`, `CourseV1` from `src/lib/migrate.ts`. `storage.ts` keeps its exports (`loadData`, `saveData`, `upsertCourse`, `deleteCourse`, `exportData`, `importData`, `uid`); `loadData` and `importData` now accept v1 or v2 payloads and always return v2.

- [ ] **Step 1: Write failing migration tests**

Create `src/lib/migrate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./migrate` module not found.

- [ ] **Step 3: Implement `src/lib/migrate.ts`**

```ts
import type { AppData, Component, Course, DropRule, Hurdle, Item } from "../types";
import { countTarget } from "./grades";

// v1 stored shapes (before the percent-only model). Structural types only —
// the real v1 types no longer exist in the codebase.

export interface ItemV1 {
  id: string;
  label: string;
  score?: number;
  max: number;
}

export interface ComponentV1 {
  id: string;
  name: string;
  weight: number;
  items: ItemV1[];
  drop?: DropRule;
  linkGroupId?: string;
  needsReview?: string;
}

export interface CourseV1 {
  id: string;
  name: string;
  code?: string;
  term?: string;
  scoreMode: "percentage" | "points";
  targetGrade?: number;
  components: ComponentV1[];
  hurdles: Hurdle[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppDataV1 {
  version: 1;
  courses: CourseV1[];
}

export function migrateV1(data: AppDataV1): AppData {
  return { version: 2, courses: data.courses.map(migrateCourse) };
}

function migrateCourse(c: CourseV1): Course {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    term: c.term,
    targetGrade: c.targetGrade,
    components: c.components.map((comp) => migrateComponent(comp, c.scoreMode)),
    hurdles: c.hurdles ?? [],
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function migrateComponent(comp: ComponentV1, mode: CourseV1["scoreMode"]): Component {
  const items: Item[] = comp.items.map((it) => ({
    id: it.id,
    label: it.label,
    score:
      it.score === undefined || it.score === null
        ? undefined
        : (it.score / (it.max || 100)) * 100,
  }));

  // points mode: the component's share of the course was its counting slots x
  // mean item max; carrying that over as the weight preserves every ratio.
  let weight = comp.weight;
  if (mode === "points") {
    const n = comp.items.length;
    const avgMax = n > 0 ? comp.items.reduce((s, it) => s + (it.max || 0), 0) / n : 0;
    weight = countTarget(comp.drop, n) * avgMax;
  }

  return {
    id: comp.id,
    name: comp.name,
    weight,
    items,
    drop: comp.drop,
    linkGroupId: comp.linkGroupId,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update `src/lib/storage.ts` to load/import both versions**

Replace the top of the file (imports through `importData`) so the whole file reads:

```ts
import type { AppData, Course } from "../types";
import { migrateV1, type AppDataV1 } from "./migrate";

// The key predates the v2 schema; the `version` field inside distinguishes.
const DATA_KEY = "grade-tracker:data:v1";

const empty: AppData = { version: 2, courses: [] };

function coerce(parsed: unknown): AppData | null {
  const p = parsed as { version?: number; courses?: unknown };
  if (!p || !Array.isArray(p.courses)) return null;
  if (p.version === 2) return p as AppData;
  if (p.version === 1) return migrateV1(p as AppDataV1);
  return null;
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { ...empty };
    const data = coerce(JSON.parse(raw));
    if (data) return data;
  } catch {
    // fall through to empty
  }
  return { ...empty };
}

export function saveData(data: AppData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function upsertCourse(data: AppData, course: Course): AppData {
  const courses = data.courses.slice();
  const idx = courses.findIndex((c) => c.id === course.id);
  const stamped = { ...course, updatedAt: Date.now() };
  if (idx >= 0) courses[idx] = stamped;
  else courses.push(stamped);
  return { ...data, courses };
}

export function deleteCourse(data: AppData, courseId: string): AppData {
  return { ...data, courses: data.courses.filter((c) => c.id !== courseId) };
}

// --- Export / import --------------------------------------------------------

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grade-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(file: File): Promise<AppData> {
  const text = await file.text();
  const data = coerce(JSON.parse(text));
  if (!data) throw new Error("Not a valid Grade Tracker backup file.");
  return data;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
```

Note: `loadData` returns the migrated data without writing it back; `App.tsx` already has `useEffect(() => saveData(data), [data])`, which persists the migrated shape on first render.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/migrate.ts src/lib/migrate.test.ts src/lib/storage.ts
git commit -m "feat: automatic v1->v2 migration in load and backup import"
```

---

### Task 3: Remove letter grades from format + ring

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/components/GradeRing.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `format.ts` exports only `pct(v, digits?)` and `gradeColor(v)`. `GradeRing` props unchanged (`value, size?, stroke?, track?, label?`); the caption under the number is now `label ?? "%"` (empty when value is null).

- [ ] **Step 1: Delete `letterGrade` from `src/lib/format.ts`**

Replace the full contents with:

```ts
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** Map a grade to a semantic colour token value. */
export function gradeColor(v: number | null): string {
  if (v === null) return "#8a847c";
  if (v >= 80) return "#3f7d4e";
  if (v >= 65) return "#b78514";
  if (v >= 50) return "#b4541f";
  return "#b03a2e";
}
```

- [ ] **Step 2: Update `src/components/GradeRing.tsx`**

Change the import line and the caption span:

```ts
import { gradeColor } from "../lib/format";
```

and replace the caption block at the bottom:

```tsx
      <div className="absolute flex flex-col items-center">
        <span
          className="font-display font-semibold leading-none tabular-nums"
          style={{ fontSize: size * 0.26, color }}
        >
          {value === null ? "—" : Math.round(value)}
        </span>
        <span className="mt-1 text-xs font-semibold tracking-wide text-ink-faint">
          {label ?? (value === null ? "" : "%")}
        </span>
      </div>
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (no lib test touches these; guards against accidental engine edits).

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/components/GradeRing.tsx
git commit -m "feat: remove letter grades — percentages everywhere"
```

---

### Task 4: ComponentCard (view/edit rendering)

**Files:**
- Create: `src/components/ComponentCard.tsx`

**Interfaces:**
- Consumes: `Component`, `Item`, `DropRule` from `../types`; `ComponentSummary` from `../lib/grades`; `uid` from `../lib/storage`.
- Produces: `export function ComponentCard(props: ComponentCardProps)` with:

```ts
interface ComponentCardProps {
  component: Component;
  editing: boolean;
  /** Normalized summary for this component (weight as % share, graded counts). */
  summary: ComponentSummary | undefined;
  /** Show the normalized share next to the raw weight (course total ≠ ~100). */
  showNormalized: boolean;
  /** true/false = this member of a better-of group is currently counting / losing; null = standalone. */
  counting: boolean | null;
  /** Other components available for better-of pairing (id + name), excluding self. */
  pairOptions: { id: string; name: string }[];
  /** Id of the component this one is currently paired with (pairs only), else null. */
  pairedWithId: string | null;
  onChange: (patch: Partial<Component>) => void;
  onRemove: () => void;
  /** Pair with another component (otherId) or unpair (null). */
  onPair: (otherId: string | null) => void;
}
```

- [ ] **Step 1: Create `src/components/ComponentCard.tsx`**

```tsx
import type { Component, DropRule, Item } from "../types";
import type { ComponentSummary } from "../lib/grades";
import { uid } from "../lib/storage";

interface ComponentCardProps {
  component: Component;
  editing: boolean;
  summary: ComponentSummary | undefined;
  showNormalized: boolean;
  counting: boolean | null;
  pairOptions: { id: string; name: string }[];
  pairedWithId: string | null;
  onChange: (patch: Partial<Component>) => void;
  onRemove: () => void;
  onPair: (otherId: string | null) => void;
}

export function ComponentCard({
  component,
  editing,
  summary,
  showNormalized,
  counting,
  pairOptions,
  pairedWithId,
  onChange,
  onRemove,
  onPair,
}: ComponentCardProps) {
  const setItem = (id: string, p: Partial<Item>) =>
    onChange({ items: component.items.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  const removeItem = (id: string) =>
    onChange({ items: component.items.filter((it) => it.id !== id) });
  const addItem = () =>
    onChange({
      items: [
        ...component.items,
        { id: uid(), label: `${component.name} ${component.items.length + 1}` },
      ],
    });

  const dropKind = component.drop?.kind ?? "none";
  const dropCount =
    component.drop?.kind === "keepBest"
      ? component.drop.keep
      : component.drop?.kind === "dropLowest"
        ? component.drop.dropLowest
        : 0;

  const setDrop = (kind: string, count: number) => {
    let drop: DropRule | undefined;
    if (kind === "keepBest") drop = { kind: "keepBest", keep: Math.max(1, count || 1) };
    else if (kind === "dropLowest")
      drop = { kind: "dropLowest", dropLowest: Math.max(1, count || 1) };
    onChange({ drop });
  };

  const gradedNote =
    summary && summary.totalItems > 1 && summary.gradedCount < summary.totalItems
      ? `${summary.gradedCount} of ${summary.totalItems} graded`
      : null;
  const dropNote =
    component.drop?.kind === "keepBest"
      ? `best ${component.drop.keep} of ${component.items.length} count`
      : component.drop?.kind === "dropLowest"
        ? `lowest ${component.drop.dropLowest} dropped`
        : null;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line/70 bg-paper-sunk/40 px-4 py-2.5">
        {editing ? (
          <input
            value={component.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="min-w-0 flex-1 rounded bg-paper-card px-2 py-0.5 font-display text-base font-semibold outline-none ring-1 ring-line focus:ring-accent"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
            {component.name}
          </h3>
        )}

        {counting === true && (
          <span className="inline-flex items-center gap-1 rounded-full bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">
            ✓ counting
          </span>
        )}

        {editing ? (
          <label className="flex shrink-0 items-center gap-1 text-sm text-ink-soft">
            <input
              type="number"
              min={0}
              value={component.weight || ""}
              onChange={(e) => onChange({ weight: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 rounded border border-line bg-paper-card px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
            />
            wt
          </label>
        ) : (
          <span className="shrink-0 rounded-full bg-paper-sunk px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {showNormalized && summary
              ? `${component.weight} wt · ${summary.weight.toFixed(summary.weight % 1 ? 1 : 0)}%`
              : `${component.weight}%`}
          </span>
        )}

        {editing && (
          <button
            onClick={onRemove}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-faint hover:bg-bad/10 hover:text-bad"
            title="Remove component"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-line/60">
        {component.items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 px-4 py-2">
            {editing ? (
              <input
                value={it.label}
                onChange={(e) => setItem(it.id, { label: e.target.value })}
                className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm outline-none ring-1 ring-line/60 focus:ring-accent"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm">{it.label}</span>
            )}
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={it.score ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) =>
                setItem(it.id, {
                  score: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                })
              }
              placeholder="—"
              className="w-16 rounded-md border border-line bg-paper-card px-2 py-1 text-right text-sm tabular-nums outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <span className="w-3 text-sm text-ink-faint">%</span>
            {editing && (
              <button
                onClick={() => removeItem(it.id)}
                className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:text-bad"
                title="Remove item"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer: passive notes in view mode; full controls in edit mode */}
      {editing ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 px-4 py-2.5 text-xs text-ink-soft">
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add item
          </button>
          <label className="flex items-center gap-1.5">
            <span className="text-ink-faint">Rule</span>
            <select
              value={dropKind}
              onChange={(e) => setDrop(e.target.value, dropCount || 1)}
              className="rounded border border-line bg-paper-card px-1.5 py-1 outline-none focus:border-accent"
            >
              <option value="none">count all</option>
              <option value="keepBest">best N of {component.items.length}</option>
              <option value="dropLowest">drop lowest</option>
            </select>
          </label>
          {dropKind !== "none" && (
            <input
              type="number"
              min={1}
              value={dropCount}
              onChange={(e) => setDrop(dropKind, Number(e.target.value))}
              className="w-14 rounded border border-line bg-paper-card px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
            />
          )}
          <label className="flex items-center gap-1.5" title="Only the better-scoring of the pair counts toward the grade">
            <span className="text-ink-faint">Better of</span>
            <select
              value={pairedWithId ?? ""}
              onChange={(e) => onPair(e.target.value || null)}
              className="max-w-40 rounded border border-line bg-paper-card px-1.5 py-1 outline-none focus:border-accent"
            >
              <option value="">—</option>
              {pairOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  this vs {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        (dropNote || gradedNote) && (
          <div className="border-t border-line/70 px-4 py-2 text-xs text-ink-faint">
            {[dropNote, gradedNote].filter(Boolean).join(" · ")}
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS (new file; nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/ComponentCard.tsx
git commit -m "feat: ComponentCard with view/edit split and better-of picker"
```

---

### Task 5: CourseDetail rework (page edit mode)

**Files:**
- Rewrite: `src/components/CourseDetail.tsx`

**Interfaces:**
- Consumes: `ComponentCard` (Task 4 props exactly as defined), `gradeSummary` (incl. `countingIds`), `requiredAverage`, `totalWeight`, `pct`, `GradeRing`, `uid`.
- Produces: same external contract as today — `CourseDetail({ course, onChange, onDelete, onBack })`. Everything else is internal.

- [ ] **Step 1: Replace the full contents of `src/components/CourseDetail.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { Component, Course } from "../types";
import { gradeSummary, requiredAverage, totalWeight } from "../lib/grades";
import { pct } from "../lib/format";
import { uid } from "../lib/storage";
import { GradeRing } from "./GradeRing";
import { ComponentCard } from "./ComponentCard";

interface Props {
  course: Course;
  onChange: (c: Course) => void;
  onDelete: () => void;
  onBack: () => void;
}

/** Display blocks: standalone components, or a better-of group rendered together. */
type Block =
  | { kind: "single"; component: Component }
  | { kind: "group"; id: string; members: Component[] };

function buildBlocks(components: Component[]): Block[] {
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const c of components) {
    if (!c.linkGroupId) {
      blocks.push({ kind: "single", component: c });
      continue;
    }
    if (seen.has(c.linkGroupId)) continue;
    seen.add(c.linkGroupId);
    const members = components.filter((m) => m.linkGroupId === c.linkGroupId);
    if (members.length === 1) blocks.push({ kind: "single", component: c });
    else blocks.push({ kind: "group", id: c.linkGroupId, members });
  }
  return blocks;
}

export function CourseDetail({ course, onChange, onDelete, onBack }: Props) {
  const [editing, setEditing] = useState(false);
  const summary = useMemo(() => gradeSummary(course), [course]);
  const tw = useMemo(() => totalWeight(course), [course]);
  const showNormalized = Math.abs(tw - 100) >= 0.5;

  const patch = (p: Partial<Course>) => onChange({ ...course, ...p });

  const updateComponent = (id: string, p: Partial<Component>) =>
    patch({ components: course.components.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const removeComponent = (id: string) =>
    patch({ components: course.components.filter((c) => c.id !== id) });

  const addComponent = () =>
    patch({
      components: [
        ...course.components,
        {
          id: uid(),
          name: "New component",
          weight: 0,
          items: [{ id: uid(), label: "Item 1" }],
        },
      ],
    });

  /** Pair `aId` with `otherId` ("whichever is better"), or unpair when null. */
  const pairBetterOf = (aId: string, otherId: string | null) => {
    const comps = course.components.map((c) => ({ ...c }));
    const dissolve = (gid: string | undefined) => {
      if (!gid) return;
      for (const m of comps) if (m.linkGroupId === gid) delete m.linkGroupId;
    };
    const a = comps.find((c) => c.id === aId);
    if (!a) return;
    dissolve(a.linkGroupId);
    if (otherId) {
      const b = comps.find((c) => c.id === otherId);
      if (b) {
        dissolve(b.linkGroupId);
        const gid = uid();
        a.linkGroupId = gid;
        b.linkGroupId = gid;
      }
    }
    patch({ components: comps });
  };

  const blocks = buildBlocks(course.components);
  const summaryFor = (id: string) => summary.components.find((cs) => cs.component.id === id);

  const renderCard = (c: Component, counting: boolean | null) => {
    const group = c.linkGroupId
      ? course.components.filter((m) => m.linkGroupId === c.linkGroupId)
      : [];
    const pairedWithId =
      group.length === 2 ? (group.find((m) => m.id !== c.id)?.id ?? null) : null;
    return (
      <ComponentCard
        key={c.id}
        component={c}
        editing={editing}
        summary={summaryFor(c.id)}
        showNormalized={showNormalized}
        counting={counting}
        pairOptions={course.components
          .filter((o) => o.id !== c.id)
          .map((o) => ({ id: o.id, name: o.name }))}
        pairedWithId={pairedWithId}
        onChange={(p) => updateComponent(c.id, p)}
        onRemove={() => removeComponent(c.id)}
        onPair={(otherId) => pairBetterOf(c.id, otherId)}
      />
    );
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All courses
      </button>

      {/* Course header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={course.code ?? ""}
                  onChange={(e) => patch({ code: e.target.value || undefined })}
                  placeholder="CODE"
                  className="w-28 rounded bg-paper-sunk px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-soft outline-none focus:ring-2 focus:ring-accent/20"
                />
                <input
                  value={course.term ?? ""}
                  onChange={(e) => patch({ term: e.target.value || undefined })}
                  placeholder="Term"
                  className="w-32 rounded bg-paper-sunk px-2 py-1 text-xs text-ink-soft outline-none focus:ring-2 focus:ring-accent/20"
                />
                <label className="flex items-center gap-1 text-xs text-ink-soft">
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={course.credits ?? ""}
                    onChange={(e) =>
                      patch({
                        credits: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                      })
                    }
                    placeholder="—"
                    className="w-16 rounded bg-paper-sunk px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  credits
                </label>
              </div>
              <input
                value={course.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="mt-1 w-full bg-transparent font-display text-3xl font-semibold tracking-tight outline-none placeholder:text-ink-faint"
                placeholder="Course name"
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {course.code && (
                  <span className="rounded bg-paper-sunk px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {course.code}
                  </span>
                )}
                {course.term && <span className="text-xs text-ink-faint">{course.term}</span>}
                {course.credits != null && (
                  <span className="text-xs text-ink-faint">{course.credits} credits</span>
                )}
              </div>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {course.name}
              </h1>
            </>
          )}
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className={editing ? "btn-primary" : "btn-ghost"}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: components */}
        <div className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Grading scheme</h2>
          </div>

          <div className="space-y-4">
            {blocks.map((b) =>
              b.kind === "single" ? (
                renderCard(b.component, null)
              ) : (
                <div key={b.id} className="overflow-hidden rounded-xl2 border border-accent/25">
                  <div className="bg-accent-wash px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    Whichever is better counts
                  </div>
                  <div className="space-y-px bg-accent/10 [&>.card]:rounded-none [&>.card]:border-0">
                    {b.members.map((m) => {
                      const anyGraded = b.members.some((x) => x.items.some((it) => it.score != null));
                      return renderCard(m, anyGraded ? summary.countingIds.includes(m.id) : null);
                    })}
                  </div>
                </div>
              ),
            )}
          </div>

          {editing && (
            <button onClick={addComponent} className="btn-ghost mt-4 w-full border-dashed">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add component
            </button>
          )}

          {course.components.length > 0 && (
            <p className={`mt-3 text-xs ${showNormalized ? "text-warn" : "text-ink-faint"}`}>
              Weights total {tw.toFixed(tw % 1 ? 1 : 0)}
              {showNormalized
                ? " — not 100, so each share is normalized (shown on the cards)"
                : "%"}
            </p>
          )}

          <Hurdles course={course} editing={editing} onChange={patch} />

          {editing && (
            <div className="mt-8 border-t border-line/70 pt-4">
              <button
                onClick={() => {
                  if (confirm("Delete this course and all its marks?")) onDelete();
                }}
                className="btn-ghost text-bad hover:bg-bad/5"
              >
                Delete this course
              </button>
            </div>
          )}
        </div>

        {/* Right: live summary */}
        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <StandingCard summary={summary} />
          <TargetCard course={course} onChange={patch} />
        </aside>
      </div>
    </div>
  );
}

function StandingCard({ summary }: { summary: ReturnType<typeof gradeSummary> }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        <GradeRing value={summary.current} track={summary.weightCompleted} />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <p className="label">Standing so far</p>
            <span
              className="cursor-help text-ink-faint"
              title="The faint ring shows how much of the grade is locked in. Projection assumes remaining work matches your current average."
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </span>
          </div>
          <p className="font-display text-sm text-ink-soft">
            {summary.anyGraded
              ? `${pct(summary.current, 0)} so far, with ${pct(summary.weightCompleted, 0)} of the grade in`
              : "No marks entered yet"}
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <Row label="Projected" value={pct(summary.projected, 1)} accent />
            <Row label="If you ace the rest" value={pct(summary.bestCase, 1)} />
            <Row label="If you bomb the rest" value={pct(summary.worstCase, 1)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className={`font-display font-semibold tabular-nums ${accent ? "text-accent" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function TargetCard({ course, onChange }: { course: Course; onChange: (p: Partial<Course>) => void }) {
  const target = course.targetGrade;
  const result = target != null ? requiredAverage(course, target) : null;

  return (
    <div className="card p-5">
      <p className="label">Target solver</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm text-ink-soft">I want to finish with</span>
        <input
          type="number"
          value={target ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) =>
            onChange({ targetGrade: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          placeholder="85"
          className="field w-20 text-center font-display font-semibold tabular-nums"
        />
        <span className="text-sm text-ink-soft">%</span>
      </div>

      {result && target != null && (
        <div className="mt-4">
          {result.status === "complete" && (
            <p className="text-sm text-ink-soft">All work is graded — nothing left to compute.</p>
          )}
          {result.status === "guaranteed" && (
            <p className="rounded-lg bg-good/10 px-3 py-2.5 text-sm font-medium text-good">
              Already locked in — you've hit {target}% no matter what.
            </p>
          )}
          {result.status === "impossible" && (
            <p className="rounded-lg bg-bad/10 px-3 py-2.5 text-sm font-medium text-bad">
              Out of reach — even 100% on the remaining {pct(result.remainingWeight, 0)} falls short.
            </p>
          )}
          {result.status === "achievable" && (
            <div className="rounded-lg bg-accent-wash px-3 py-3">
              <p className="text-sm text-ink-soft">You need an average of</p>
              <p className="font-display text-3xl font-semibold tabular-nums text-accent">
                {pct(result.required, 1)}
              </p>
              <p className="text-sm text-ink-soft">
                on the remaining {pct(result.remainingWeight, 0)} of the grade.
              </p>
            </div>
          )}
        </div>
      )}
      {target == null && (
        <p className="mt-3 text-xs text-ink-faint">
          Enter a goal to see the average you need on what's left.
        </p>
      )}
    </div>
  );
}

function Hurdles({
  course,
  editing,
  onChange,
}: {
  course: Course;
  editing: boolean;
  onChange: (p: Partial<Course>) => void;
}) {
  if (course.hurdles.length === 0 && !editing) return null;
  return (
    <div className="card mt-6 p-4">
      <p className="label mb-2">Pass requirements</p>
      <ul className="space-y-1.5">
        {course.hurdles.map((h) => (
          <li key={h.id} className="flex items-start gap-2 text-sm text-ink-soft">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            {editing ? (
              <>
                <input
                  value={h.description}
                  onChange={(e) =>
                    onChange({
                      hurdles: course.hurdles.map((x) =>
                        x.id === h.id ? { ...x, description: e.target.value } : x,
                      ),
                    })
                  }
                  className="flex-1 bg-transparent outline-none"
                />
                <button
                  onClick={() => onChange({ hurdles: course.hurdles.filter((x) => x.id !== h.id) })}
                  className="text-ink-faint hover:text-bad"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <span className="flex-1">{h.description}</span>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <button
          onClick={() =>
            onChange({ hurdles: [...course.hurdles, { id: uid(), description: "" }] })
          }
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add requirement
        </button>
      )}
    </div>
  );
}
```

Note: `bg-warn` replaces the old `gradeColor(40)` inline style on hurdle bullets (same amber intent, no format.ts dependency). The old "Points mode: grade = earned ÷ total points" footnote and the `ModePill` are gone.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/CourseDetail.tsx
git commit -m "feat: course page view/edit split with better-of groups"
```

---

### Task 6: Dashboard term overview

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `gradeSummary` (per course), `pct`, `Course.credits`.
- Produces: no new exports; `Dashboard` props unchanged.

- [ ] **Step 1: Replace the full contents of `src/components/Dashboard.tsx`**

```tsx
import { useMemo } from "react";
import type { Course } from "../types";
import { gradeSummary } from "../lib/grades";
import { pct } from "../lib/format";
import { GradeRing } from "./GradeRing";

interface Props {
  courses: Course[];
  onOpen: (id: string) => void;
  onImport: () => void;
  onNewBlank: () => void;
}

export function Dashboard({ courses, onOpen, onImport, onNewBlank }: Props) {
  const actions = (
    <div className="flex shrink-0 gap-2">
      <button onClick={onNewBlank} className="btn-ghost">
        Add manually
      </button>
      <button onClick={onImport} className="btn-accent">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Upload outline
      </button>
    </div>
  );

  if (courses.length === 0) {
    return (
      <div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label text-accent">Your term at a glance</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Grades, kept honest.
            </h1>
            <p className="mt-2 max-w-lg text-ink-soft">
              Drop in a course outline and Tally builds the grading scheme for you. Enter marks as
              they land; watch where you stand and what it takes to land your target.
            </p>
          </div>
          {actions}
        </div>
        <EmptyState onImport={onImport} onNewBlank={onNewBlank} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label text-accent">Term overview</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
            Where you stand
          </h1>
        </div>
        {actions}
      </div>

      <TermSummary courses={courses} />

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </div>
  );
}

function TermSummary({ courses }: { courses: Course[] }) {
  const stats = useMemo(() => {
    let projSum = 0;
    let projW = 0;
    let gradedSum = 0;
    let gradedW = 0;
    let onTarget = 0;
    let withTarget = 0;
    for (const c of courses) {
      const s = gradeSummary(c);
      const w = c.credits && c.credits > 0 ? c.credits : 1;
      if (s.projected !== null && s.anyGraded) {
        projSum += s.projected * w;
        projW += w;
      }
      gradedSum += s.weightCompleted * w;
      gradedW += w;
      if (c.targetGrade != null && s.projected != null) {
        withTarget++;
        if (s.projected >= c.targetGrade - 0.05) onTarget++;
      }
    }
    return {
      projected: projW > 0 ? projSum / projW : null,
      graded: gradedW > 0 ? gradedSum / gradedW : 0,
      onTarget,
      withTarget,
      anyCredits: courses.some((c) => c.credits && c.credits > 0),
    };
  }, [courses]);

  return (
    <div className="card mt-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-5">
      <TermStat label="Projected average" value={pct(stats.projected, 1)} accent />
      <TermStat label="Graded so far" value={pct(stats.graded, 0)} />
      {stats.withTarget > 0 && (
        <TermStat
          label="On track"
          value={`${stats.onTarget} of ${stats.withTarget}`}
          good={stats.onTarget === stats.withTarget}
        />
      )}
      <p className="ml-auto max-w-48 text-[11px] leading-snug text-ink-faint">
        {stats.anyCredits
          ? "Averages weighted by course credits."
          : "Averages weight every course equally — set credits on a course to change that."}
      </p>
    </div>
  );
}

function TermStat({
  label,
  value,
  accent,
  good,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <p
        className={`mt-0.5 font-display text-3xl font-semibold tabular-nums ${
          accent ? "text-accent" : good ? "text-good" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CourseCard({ course, onOpen }: { course: Course; onOpen: () => void }) {
  const s = gradeSummary(course);
  const target = course.targetGrade;
  const onTrack = target != null && s.projected != null ? s.projected >= target - 0.05 : null;

  return (
    <button
      onClick={onOpen}
      className="card group flex items-center gap-5 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <GradeRing value={s.current} size={108} stroke={9} track={s.weightCompleted} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {course.code && (
            <span className="rounded bg-paper-sunk px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-soft">
              {course.code}
            </span>
          )}
          {course.term && <span className="text-xs text-ink-faint">{course.term}</span>}
        </div>
        <h3 className="mt-1 truncate font-display text-lg font-semibold leading-snug">
          {course.name}
        </h3>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <Stat label="Projected" value={pct(s.projected, 0)} />
          <Stat label="Graded" value={pct(s.weightCompleted, 0)} />
        </dl>

        {target != null && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                onTrack ? "bg-good/10 text-good" : "bg-bad/10 text-bad"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {onTrack ? "On track" : "Behind"} · target {target}%
            </span>
          </div>
        )}
      </div>
      <svg className="shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="font-display text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ onImport, onNewBlank }: { onImport: () => void; onNewBlank: () => void }) {
  return (
    <div className="card mt-9 flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-wash text-accent">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h4" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold">No courses yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-ink-soft">
          Upload a syllabus or course outline (PDF or HTML) and Tally will pull out the grading
          scheme automatically.
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onImport} className="btn-accent">
          Upload an outline
        </button>
        <button onClick={onNewBlank} className="btn-ghost">
          Or start from scratch
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: term overview strip on the dashboard"
```

---

### Task 7: Extraction v2 (client mapping + API schema)

**Files:**
- Rewrite: `src/lib/extract.ts`
- Create: `src/lib/extract.test.ts`
- Modify: `api/extract.ts` (SYSTEM prompt + SCHEMA only; the handler body is unchanged)

**Interfaces:**
- Consumes: v2 `Course`/`Component`/`Item` types, `uid`.
- Produces from `src/lib/extract.ts`:

```ts
export interface Confirmation {
  id: string;                                  // client-generated uid
  componentIndex: number | null;               // null = course-level note
  field: "itemCount" | "weight" | "note";
  question: string;
  suggestion: number;
  choices: number[];
}
export interface ExtractionResult { course: Course; confirmations: Confirmation[] }
export async function extractCourse(file: File): Promise<ExtractionResult>;
export function applyConfirmations(
  course: Course,
  confirmations: Confirmation[],
  answers: Record<string, number>,             // keyed by Confirmation.id; notes have no entry
): Course;
```

- [ ] **Step 1: Write failing tests for `applyConfirmations`**

Create `src/lib/extract.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `applyConfirmations` is not exported (and the module still references v1 fields).

- [ ] **Step 3: Rewrite `src/lib/extract.ts`**

```ts
import type { Component, Course, DropRule, Item } from "../types";
import { uid } from "./storage";

// Outline extraction. The actual LLM call (Google Gemini) happens server-side in
// /api/extract, which holds the API key — the browser never sees it. This module
// sends the file to that endpoint and maps the returned scheme into a Course
// plus a list of confirmations the user resolves on the review screen.

interface ExtractedComponent {
  name: string;
  weight: number;
  itemCount: number;
  dropKind: "none" | "keepBest" | "dropLowest";
  dropCount: number;
  linkGroupId: string;
}

interface ExtractedConfirmation {
  componentIndex: number; // -1 = course-level
  field: "itemCount" | "weight" | "note";
  question: string;
  suggestion: number;
  choices: number[];
}

interface Extracted {
  name: string;
  code: string;
  term: string;
  components: ExtractedComponent[];
  confirmations: ExtractedConfirmation[];
  hurdles: string[];
  notes: string;
}

export interface Confirmation {
  id: string;
  componentIndex: number | null;
  field: "itemCount" | "weight" | "note";
  question: string;
  suggestion: number;
  choices: number[];
}

export interface ExtractionResult {
  course: Course;
  confirmations: Confirmation[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Strip an HTML document down to readable text to keep token cost low. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, noscript, svg").forEach((el) => el.remove());
  const text = doc.body?.innerText || doc.body?.textContent || "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function makeItems(name: string, count: number, existing: Item[] = []): Item[] {
  const n = Math.max(1, Math.round(count));
  return Array.from({ length: n }, (_, i) =>
    existing[i] ?? { id: uid(), label: n > 1 ? `${name} ${i + 1}` : name },
  );
}

function toComponent(ec: ExtractedComponent): Component {
  let drop: DropRule | undefined;
  if (ec.dropKind === "keepBest" && ec.dropCount > 0) drop = { kind: "keepBest", keep: ec.dropCount };
  else if (ec.dropKind === "dropLowest" && ec.dropCount > 0)
    drop = { kind: "dropLowest", dropLowest: ec.dropCount };

  return {
    id: uid(),
    name: ec.name,
    weight: ec.weight || 0,
    items: makeItems(ec.name, ec.itemCount || 1),
    drop,
    linkGroupId: ec.linkGroupId?.trim() || undefined,
  };
}

function toResult(ex: Extracted): ExtractionResult {
  const course: Course = {
    id: uid(),
    name: ex.name || "Untitled course",
    code: ex.code || undefined,
    term: ex.term || undefined,
    components: (ex.components || []).map(toComponent),
    hurdles: (ex.hurdles || []).filter(Boolean).map((d) => ({ id: uid(), description: d })),
    notes: ex.notes || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const confirmations: Confirmation[] = (ex.confirmations || [])
    .filter((c) => c && c.question)
    .map((c) => ({
      id: uid(),
      componentIndex:
        c.componentIndex >= 0 && c.componentIndex < course.components.length
          ? c.componentIndex
          : null,
      field: c.field === "itemCount" || c.field === "weight" ? c.field : "note",
      question: c.question,
      suggestion: c.suggestion || 0,
      choices: (c.choices || []).filter((n) => Number.isFinite(n) && n > 0),
    }));

  return { course, confirmations };
}

/** Apply the user's confirmation answers (keyed by Confirmation.id) to the course. */
export function applyConfirmations(
  course: Course,
  confirmations: Confirmation[],
  answers: Record<string, number>,
): Course {
  const components = course.components.slice();
  for (const conf of confirmations) {
    if (conf.field === "note" || conf.componentIndex === null) continue;
    const answer = answers[conf.id];
    if (answer === undefined || !(answer > 0)) continue;
    const c = components[conf.componentIndex];
    if (!c) continue;
    if (conf.field === "weight") {
      components[conf.componentIndex] = { ...c, weight: answer };
    } else {
      components[conf.componentIndex] = { ...c, items: makeItems(c.name, answer, c.items) };
    }
  }
  return { ...course, components };
}

export async function extractCourse(file: File): Promise<ExtractionResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let payload: { kind: "pdf"; data: string } | { kind: "text"; text: string };
  if (isPdf) {
    payload = { kind: "pdf", data: await fileToBase64(file) };
  } else {
    const raw = await file.text();
    const text = raw.includes("<") ? htmlToText(raw) : raw;
    payload = { kind: "text", text };
  }

  let res: Response;
  try {
    res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the extraction service. Check your connection.");
  }

  if (res.status === 404) {
    throw new Error(
      "Extraction service not found. Running locally? Use `vercel dev` — plain `npm run dev` doesn't run the /api function.",
    );
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `Extraction failed (${res.status}).`);
  }

  return toResult(json as Extracted);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update `api/extract.ts` prompt and schema**

Replace the `SYSTEM` constant with:

```ts
const SYSTEM = `You extract grading schemes from university course outlines into a strict JSON structure.

Read the outline and identify every graded assessment category and its weight. Weights are unit-agnostic — use the outline's own numbers:
- Percentage schemes: weight = the category's TOTAL share ("2% each" x3 assignments => itemCount 3, weight 6). Non-linked components should sum to ~100.
- Points-based schemes ("total of 80 points"): weight = the category's total points (8 quizzes x 3 points => itemCount 8, weight 24).
- "best 9 of 11" => itemCount 11, dropKind keepBest, dropCount 9.
- "lowest 2 not counted" => dropKind dropLowest, dropCount 2.
- "midterm OR final, whichever is better" => two components with the same linkGroupId and the same weight.
- Ignore ungraded items (e.g. "Introduce yourself — ungraded").

Never guess silently. When the outline is ambiguous or conflicting, still fill in your best value AND add an entry to confirmations:
- Variable counts ("4-12 pop quizzes"): field "itemCount", componentIndex of that component, suggestion = your estimate, choices [], question quoting the outline.
- Conflicting numbers (a table says 30 but the text says 35): field "weight", choices = the conflicting values, suggestion = the likelier one.
- Ambiguity with no numeric answer: field "note", componentIndex -1, suggestion 0, choices [].
componentIndex is the 0-based index into components, or -1 for course-level notes. Return an empty confirmations array when nothing is ambiguous.`;
```

Replace the `SCHEMA` constant with:

```ts
const SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Full course name." },
    code: { type: "STRING", description: "Course code, e.g. AMATH 250. Empty if unknown." },
    term: { type: "STRING", description: "Term, e.g. Spring 2026. Empty if unknown." },
    components: {
      type: "ARRAY",
      description: "One entry per assessment category in the grading scheme.",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          weight: {
            type: "NUMBER",
            description:
              "The category's total share of the final grade, in the outline's own unit (percent or points).",
          },
          itemCount: {
            type: "INTEGER",
            description: "How many individual assessments are in this category. Best estimate for variable counts.",
          },
          dropKind: {
            type: "STRING",
            enum: ["none", "keepBest", "dropLowest"],
            description: "'keepBest' for 'best N of M'; 'dropLowest' for 'lowest K not counted'; else 'none'.",
          },
          dropCount: { type: "INTEGER", description: "keepBest => N kept; dropLowest => K dropped; none => 0." },
          linkGroupId: {
            type: "STRING",
            description:
              "Same id on two+ components that are alternatives ('whichever is better'). Empty otherwise. Give linked components the SAME weight.",
          },
        },
        required: ["name", "weight", "itemCount", "dropKind", "dropCount", "linkGroupId"],
        propertyOrdering: ["name", "weight", "itemCount", "dropKind", "dropCount", "linkGroupId"],
      },
    },
    confirmations: {
      type: "ARRAY",
      description: "Questions the user must confirm because the outline was ambiguous or conflicting. Empty when unambiguous.",
      items: {
        type: "OBJECT",
        properties: {
          componentIndex: {
            type: "INTEGER",
            description: "0-based index into components, or -1 for a course-level note.",
          },
          field: {
            type: "STRING",
            enum: ["itemCount", "weight", "note"],
            description: "Which value the answer applies to. 'note' = no numeric answer, just needs acknowledging.",
          },
          question: { type: "STRING", description: "Short question for the user, quoting the outline." },
          suggestion: { type: "NUMBER", description: "Your best-guess answer. 0 for notes." },
          choices: {
            type: "ARRAY",
            items: { type: "NUMBER" },
            description: "The conflicting values when the outline states more than one. Empty otherwise.",
          },
        },
        required: ["componentIndex", "field", "question", "suggestion", "choices"],
        propertyOrdering: ["componentIndex", "field", "question", "suggestion", "choices"],
      },
    },
    hurdles: {
      type: "ARRAY",
      description: "Pass requirements beyond the weighted total. Plain sentences.",
      items: { type: "STRING" },
    },
    notes: { type: "STRING", description: "Any other useful context. Empty if none." },
  },
  required: ["name", "code", "term", "components", "confirmations", "hurdles", "notes"],
  propertyOrdering: ["name", "code", "term", "components", "confirmations", "hurdles", "notes"],
};
```

The rest of `api/extract.ts` (handler, error handling) is unchanged.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/extract.ts src/lib/extract.test.ts api/extract.ts
git commit -m "feat: extraction v2 — unit-agnostic weights and structured confirmations"
```

---

### Task 8: ImportReview confirmations UI

**Files:**
- Modify: `src/components/ImportReview.tsx`

**Interfaces:**
- Consumes: `extractCourse(): Promise<ExtractionResult>`, `applyConfirmations`, `Confirmation` from `../lib/extract`; `totalWeight`.
- Produces: `ImportReview({ onCancel, onSave })` — unchanged external contract. Save is disabled until every `note` confirmation is checked; numeric confirmations are prefilled with suggestions.

- [ ] **Step 1: Replace the full contents of `src/components/ImportReview.tsx`**

```tsx
import { useState } from "react";
import type { Course } from "../types";
import {
  applyConfirmations,
  extractCourse,
  type Confirmation,
  type ExtractionResult,
} from "../lib/extract";
import { totalWeight } from "../lib/grades";

interface Props {
  onCancel: () => void;
  onSave: (course: Course) => void;
}

type Stage =
  | { kind: "drop" }
  | { kind: "loading"; name: string }
  | { kind: "review"; result: ExtractionResult }
  | { kind: "error"; message: string };

export function ImportReview({ onCancel, onSave }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "drop" });
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setStage({ kind: "loading", name: file.name });
    try {
      const result = await extractCourse(file);
      setStage({ kind: "review", result });
    } catch (e) {
      setStage({ kind: "error", message: e instanceof Error ? e.message : "Extraction failed." });
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="card relative z-10 max-h-[88vh] w-full max-w-2xl overflow-hidden bg-paper-card shadow-lift">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <h2 className="font-display text-xl font-semibold">
            {stage.kind === "review" ? "Review the grading scheme" : "Upload a course outline"}
          </h2>
          <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-paper-sunk">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(88vh-64px)] overflow-y-auto p-5">
          {stage.kind === "drop" && (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl2 border-2 border-dashed px-6 py-14 text-center transition ${
                dragOver ? "border-accent bg-accent-wash" : "border-line bg-paper-sunk/40 hover:border-accent/50"
              }`}
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-wash text-accent">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <div>
                <p className="font-display text-lg font-semibold">Drop your outline here</p>
                <p className="mt-0.5 text-sm text-ink-soft">PDF or HTML · or click to browse</p>
              </div>
              <input
                type="file"
                accept=".pdf,.html,.htm,application/pdf,text/html"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          )}

          {stage.kind === "loading" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <Spinner />
              <div>
                <p className="font-display text-lg font-semibold">Reading {stage.name}…</p>
                <p className="mt-0.5 text-sm text-ink-soft">Pulling out components and weights.</p>
              </div>
            </div>
          )}

          {stage.kind === "error" && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-bad/10 text-bad">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4M12 17h.01M10.3 3.86l-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.44l-8.5-14.7a2 2 0 0 0-3.4 0z" />
                </svg>
              </div>
              <p className="max-w-sm text-sm text-ink-soft">{stage.message}</p>
              <button onClick={() => setStage({ kind: "drop" })} className="btn-ghost">
                Try another file
              </button>
            </div>
          )}

          {stage.kind === "review" && (
            <ReviewBody
              result={stage.result}
              onChangeName={(name) =>
                setStage({
                  kind: "review",
                  result: { ...stage.result, course: { ...stage.result.course, name } },
                })
              }
              onSave={(course) => onSave(course)}
              onRedo={() => setStage({ kind: "drop" })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewBody({
  result,
  onChangeName,
  onSave,
  onRedo,
}: {
  result: ExtractionResult;
  onChangeName: (name: string) => void;
  onSave: (course: Course) => void;
  onRedo: () => void;
}) {
  const { course, confirmations } = result;
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      confirmations.filter((c) => c.field !== "note").map((c) => [c.id, c.suggestion]),
    ),
  );
  const [acked, setAcked] = useState<Record<string, boolean>>({});

  const notes = confirmations.filter((c) => c.field === "note");
  const numeric = confirmations.filter((c) => c.field !== "note");
  const allAcked = notes.every((c) => acked[c.id]);
  const tw = totalWeight(course);

  return (
    <div>
      <div className="mb-4">
        <p className="label">Course</p>
        <input
          value={course.name}
          onChange={(e) => onChangeName(e.target.value)}
          className="mt-1 w-full bg-transparent font-display text-2xl font-semibold outline-none"
        />
        <p className="text-sm text-ink-faint">
          {[course.code, course.term].filter(Boolean).join(" · ") || "Detected from the outline"}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-sunk/50 text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">Component</th>
              <th className="px-3 py-2 text-center font-semibold">Items</th>
              <th className="px-3 py-2 text-center font-semibold">Rule</th>
              <th className="px-3 py-2 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {course.components.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  {c.linkGroupId && (
                    <div className="text-[11px] text-accent">whichever is better</div>
                  )}
                </td>
                <td className="px-3 py-2 text-center tabular-nums text-ink-soft">{c.items.length}</td>
                <td className="px-3 py-2 text-center text-xs text-ink-soft">
                  {c.drop?.kind === "keepBest"
                    ? `best ${c.drop.keep}`
                    : c.drop?.kind === "dropLowest"
                      ? `drop ${c.drop.dropLowest}`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-right font-display font-semibold tabular-nums">
                  {c.weight}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Weights total {tw % 1 ? tw.toFixed(1) : tw}
        {Math.abs(tw - 100) < 0.5 ? "%" : " — treated as shares of the total"}
      </p>

      {confirmations.length > 0 && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent-wash/50 p-4">
          <p className="label text-accent">Confirm these</p>
          <div className="mt-2 space-y-3">
            {numeric.map((conf) => (
              <div key={conf.id}>
                <p className="text-sm text-ink-soft">
                  {conf.componentIndex !== null && (
                    <span className="font-semibold">
                      {course.components[conf.componentIndex]?.name}:{" "}
                    </span>
                  )}
                  {conf.question}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {conf.choices.map((choice) => (
                    <button
                      key={choice}
                      onClick={() => setAnswers((a) => ({ ...a, [conf.id]: choice }))}
                      className={`rounded-full border px-2.5 py-0.5 text-sm tabular-nums transition ${
                        answers[conf.id] === choice
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-paper-card text-ink-soft hover:border-accent/50"
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    value={answers[conf.id] ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [conf.id]: Number(e.target.value) }))
                    }
                    className="w-20 rounded-md border border-line bg-paper-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-accent"
                  />
                </div>
              </div>
            ))}
            {notes.map((conf) => (
              <label key={conf.id} className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={acked[conf.id] ?? false}
                  onChange={(e) => setAcked((a) => ({ ...a, [conf.id]: e.target.checked }))}
                  className="mt-0.5 accent-accent"
                />
                <span>{conf.question}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {course.hurdles.length > 0 && (
        <div className="mt-3 rounded-lg bg-paper-sunk/50 px-3 py-2 text-xs text-ink-soft">
          <span className="font-semibold">Pass requirements: </span>
          {course.hurdles.map((h) => h.description).join(" · ")}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        Looks off? Save and fine-tune every field on the course page.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onRedo} className="btn-ghost">
          Re-upload
        </button>
        <button
          onClick={() => onSave(applyConfirmations(course, confirmations, answers))}
          disabled={!allAcked}
          className="btn-accent disabled:cursor-not-allowed disabled:opacity-50"
          title={allAcked ? undefined : "Tick the checkboxes above first"}
        >
          Save &amp; open
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-accent" />
  );
}
```

- [ ] **Step 2: Full build must now pass**

Run: `npm test && npm run build`
Expected: tests PASS and `tsc -b && vite build` completes — this is the task that closes the red-build window. If tsc reports leftover v1 references, fix them in place (they are omissions from earlier tasks, not new design).

- [ ] **Step 3: Commit**

```bash
git add src/components/ImportReview.tsx
git commit -m "feat: import review confirms extraction ambiguities before save"
```

---

### Task 9: Final verification sweep

**Files:**
- No planned changes — fixes only if verification finds issues.

**Interfaces:**
- Consumes: everything above.
- Produces: verified, committed working tree.

- [ ] **Step 1: Full gates**

Run: `npm test && npm run build && npm run lint`
Expected: all pass with zero errors.

- [ ] **Step 2: Manual verification in the browser (REQUIRED SUB-SKILL: superpowers:verification-before-completion; use the `verify`/`run` skill or Playwright MCP tools)**

Start the dev server (`npm run dev`), then:

1. **Migration:** seed a v1 payload in the browser console, reload, and confirm the course renders with percent scores and the same grade:

```js
localStorage.setItem("grade-tracker:data:v1", JSON.stringify({
  version: 1,
  courses: [{
    id: "amath", name: "Introduction to Differential Equations", code: "AMATH 250",
    term: "Spring 2026", scoreMode: "points",
    components: [
      { id: "pop", name: "Pop Quizzes", weight: 0,
        drop: { kind: "dropLowest", dropLowest: 2 },
        items: [
          { id: "p1", label: "Pop Quizzes 1", score: 0.83, max: 1 },
          { id: "p2", label: "Pop Quizzes 2", score: 1, max: 1 },
          { id: "p3", label: "Pop Quizzes 3", score: 1, max: 1 },
          { id: "p4", label: "Pop Quizzes 4", score: 1, max: 1 }
        ] },
      { id: "quiz", name: "Quizzes", weight: 0,
        items: [
          { id: "q1", label: "Quizzes 1", score: 1.5, max: 3 },
          { id: "q2", label: "Quizzes 2", score: 2.79, max: 3 },
          { id: "q3", label: "Quizzes 3", score: 2.55, max: 3 },
          { id: "q4", label: "Quizzes 4", score: 2.7, max: 3 },
          { id: "q5", label: "Quizzes 5", max: 3 },
          { id: "q6", label: "Quizzes 6", max: 3 },
          { id: "q7", label: "Quizzes 7", max: 3 },
          { id: "q8", label: "Quizzes 8", max: 3 },
          { id: "q9", label: "Quizzes 9", max: 3 }
        ] },
      { id: "mid", name: "Midterm", weight: 0, linkGroupId: "midterm_final",
        items: [{ id: "m1", label: "Midterm", max: 27.5 }] },
      { id: "fin", name: "Final Test", weight: 0, linkGroupId: "midterm_final",
        items: [{ id: "f1", label: "Final Test", max: 17.5 }] }
    ],
    hurdles: [], createdAt: 0, updatedAt: 0
  }]
})); location.reload();
```

Checks: the ring shows ~82; Pop Quizzes 1 shows `83%`; Quizzes 2 shows `93%`; the midterm/final pair renders as a "whichever is better" block.

2. **View mode:** no ×, no rename inputs, no rule/link controls, no Delete button visible; score inputs work and the ring updates live while typing.
3. **Edit mode:** Edit button reveals everything (renames, weights, add/remove, rules, better-of dropdown, credits, add requirement, delete-at-bottom); Done returns to the quiet view.
4. **Better-of:** pairing two components via the dropdown shows the joined block; the ✓ sits on the higher-scoring member; unpairing splits them back.
5. **Term overview:** dashboard shows the strip with projected average / graded / on-track; setting credits on a course shifts the weighted average.
6. **No letters anywhere:** rings show `%`, standing text and cards show percentages only.
7. **Empty state:** clear localStorage, reload — hero + empty state, no summary strip.

(The Gemini-dependent import flow can only be fully exercised with `vercel dev` and a `GEMINI_API_KEY`; if unavailable, verify the review screen by stubbing — paste a known `Extracted` JSON through `toResult` in a unit test or via the console — and note this in the completion report.)

- [ ] **Step 3: Update README if it mentions modes**

Check `README.md` for references to points mode / letter grades / weight-proportion entry and update the affected sentences to describe percent-only entry.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: general sweep verification fixes and docs"
```

---

## Self-Review Notes

- **Spec coverage:** model v2 (T1), engine (T1), migration incl. backup import (T2), letter-grade removal (T3), view/edit split + better-of picker + hurdles + credits input + delete-at-bottom + sidebar tooltip (T4/T5), term overview (T6), extractor schema + confirmations (T7), review-screen confirmations (T8), tests throughout, final gates (T9). Weight-normalization display: cards show `wt · N%` when totals ≠ 100 (T4) with the footnote reworded (T5).
- **Type consistency:** `Confirmation`/`ExtractionResult`/`applyConfirmations` names match between T7 and T8; `ComponentCardProps` matches usage in T5; `countingIds` defined in T1, consumed in T5; `migrateV1`/`AppDataV1` defined in T2 and used in `storage.ts`.
- **Known intentional quirk:** UI-created better-of groups are pairs; repairing a component dissolves its old group entirely (documented in `pairBetterOf`).
