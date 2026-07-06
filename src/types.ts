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
