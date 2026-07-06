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
    let disqualified = false;
    sel.forEach((memberIdx, gi) => {
      const members = groups[gi].members;
      const member = members[memberIdx];
      const memberFill = fill(member);
      const r = contribution(member, memberFill);
      // For "current standing" (fill === "graded"), a completely ungraded
      // member has denom 0 and so never drags the blended ratio down —
      // which would let it "win" over a graded sibling purely by omission.
      // Disqualify that selection whenever another member actually has
      // graded work; the entered score should count until something better
      // is entered, not get silently ignored in favor of a blank slate.
      if (
        memberFill === "graded" &&
        r.gradedCount === 0 &&
        members.some((m) => m !== member && contribution(m, "graded").gradedCount > 0)
      ) {
        disqualified = true;
      }
      earned += r.earned;
      denom += r.denom;
      chosen.push(member);
    });
    if (disqualified) continue;
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
