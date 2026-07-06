// Core data model for the grade tracker.
//
// One normalized shape covers every grading scheme we saw in real outlines:
//   - simple weighted components (Final 50%)
//   - per-item categories (R Assignments 2% each x3)
//   - drop-lowest / best-N-of-M (best 9 of 11)
//   - "whichever is better" between components (midterm vs final) via linkGroupId
//   - points-based whole-course schemes (scoreMode "points")

export type ScoreMode = "percentage" | "points";

export interface Item {
  id: string;
  label: string;
  /** Raw score the user earned. undefined until entered. */
  score?: number;
  /** Maximum possible raw score for this item (default 100 in percentage mode). */
  max: number;
}

/** best-of: keep the top `keep` items. drop-lowest: drop the worst `dropLowest`. */
export type DropRule =
  | { kind: "keepBest"; keep: number }
  | { kind: "dropLowest"; dropLowest: number };

export interface Component {
  id: string;
  name: string;
  /**
   * percentage mode: this component's share of the final grade (the weights of
   * all non-linked components should sum to ~100).
   * points mode: ignored for weighting (weight is derived from total points),
   * but retained for display.
   */
  weight: number;
  items: Item[];
  /** Optional best-of / drop-lowest rule applied across this component's items. */
  drop?: DropRule;
  /**
   * Components that share a linkGroupId form a "whichever is better" group:
   * their combined weight goes to whichever component is currently scoring
   * higher (per unit weight). undefined => standalone component.
   */
  linkGroupId?: string;
  /** Surfaced on the review screen when the extractor was unsure. */
  needsReview?: string;
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
  scoreMode: ScoreMode;
  /** Desired final grade, e.g. 85. */
  targetGrade?: number;
  components: Component[];
  hurdles: Hurdle[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  version: 1;
  courses: Course[];
}
