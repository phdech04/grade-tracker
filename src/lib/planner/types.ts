// Types for the degree planner: a curated course catalog (with boolean
// prerequisites, antirequisites, cross-listings) and major requirement trees.
// This is shared reference data, independent of any one student.

/** A prerequisite expression — supports AND / OR / "n of" and nesting. */
export type PrereqExpr =
  | { course: string }
  | { all: PrereqExpr[] }
  | { oneOf: PrereqExpr[] }
  | { nOf: { n: number; of: PrereqExpr[] } };

export interface CatalogCourse {
  code: string; // canonical, spaced form: "AMATH 250"
  title: string;
  units: number; // usually 0.5
  /** "math" counts toward the math-unit minimum; everything else is "other". */
  faculty: "math" | "other";
  prereq?: PrereqExpr;
  /** Mutually exclusive courses — can't hold credit for both. */
  antireq?: string[];
  coreq?: string[];
  /** Cross-listed equivalents (same course under another code); count once. */
  crosslist?: string[];
  /** Terms typically offered; omit when unknown (treated as any). */
  termsOffered?: ("F" | "W" | "S")[];
}

/**
 * A requirement node mirroring the calendar's "Complete all / Complete N of /
 * Complete N additional <subject> at <level>" structure.
 */
export type ReqGroup =
  | { kind: "course"; code: string }
  | { kind: "all"; label?: string; of: ReqGroup[] }
  | { kind: "chooseN"; n: number; label?: string; of: ReqGroup[] }
  | {
      // "Complete N additional AMATH courses at the 300- or 400-level", etc.
      kind: "pattern";
      n: number;
      label: string;
      subjects: string[]; // e.g. ["AMATH"]
      minLevel?: number; // inclusive course-number floor, e.g. 300
      maxLevel?: number; // inclusive ceiling, e.g. 499
      /** Explicit option pool when the calendar gives "List 1". */
      pool?: string[];
      /** Courses already counted toward core reqs can't be reused here. */
      excludeCoreReqs?: boolean;
    };

export interface Major {
  id: string;
  name: string;
  minOverallAvg: number;
  minMajorAvg: number;
  minMathUnits: number;
  minNonMathUnits: number;
  requirement: ReqGroup;
  /** "Students may only complete one course from any cross-listed set." */
  crossListNote?: boolean;
  notes?: string[];
}
