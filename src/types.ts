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

export type EventKind = "assignment" | "quiz" | "exam" | "project" | "lab" | "other";

/**
 * A dated piece of coursework — an assignment, test, project, etc. Kept
 * separate from the grade engine (Component/Item): events are about *when*
 * things are due, not how the final mark is computed.
 */
export interface CourseEvent {
  id: string;
  title: string;
  kind: EventKind;
  /** ISO "YYYY-MM-DD". undefined when no concrete calendar date is known yet. */
  due?: string;
  /** Original phrase when the date couldn't be resolved ("Week 6", "TBD"). */
  dueRaw?: string;
  /** % this assessment is worth, if stated. Display only — not fed to the engine. */
  weight?: number;
  /** Soft link to the grading Component this belongs to, if any. */
  componentId?: string;
  /** Checked off by the student. */
  done?: boolean;
  source: "outline" | "manual";
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
  /** Dated coursework (deadlines, exams). Empty for courses with none. */
  events: CourseEvent[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A completed course on the student's transcript. Independent of the in-progress
 * `Course` tracker — just a final record used for performance analytics.
 */
export interface TranscriptEntry {
  id: string;
  code?: string;
  name: string;
  /** Free-text term, e.g. "Fall 2025" or "2A". */
  term: string;
  /** Credit weight in averages; unset counts as 1. */
  credits?: number;
  /** Final percentage. undefined = ungraded / CR-NCR (excluded from averages). */
  grade?: number;
  source: "import" | "manual" | "course";
  /** Set when pulled from an in-progress Course, to dedupe and allow refresh. */
  courseId?: string;
}

export interface AppData {
  version: 4;
  courses: Course[];
  transcript: TranscriptEntry[];
}
