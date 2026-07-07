import type { AppData, Component, Course, DropRule, Hurdle, Item } from "../types";
import { countTarget } from "./grades";

// Historical stored shapes. Each migrateVN takes the version-N payload and
// returns the next version up; storage.ts chains them (v1 -> v2 -> v3).
// The real vN types no longer exist in the codebase, so they're redeclared
// structurally here.

// --- v2: percent-only model, before dated coursework (events) existed -------

/** v2 Course: identical to the current Course minus `events`. */
export interface CourseV2 {
  id: string;
  name: string;
  code?: string;
  term?: string;
  targetGrade?: number;
  credits?: number;
  components: Component[];
  hurdles: Hurdle[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppDataV2 {
  version: 2;
  courses: CourseV2[];
}

export function migrateV2(data: AppDataV2): AppDataV3 {
  return {
    version: 3,
    courses: data.courses.map((c) => ({ ...c, events: [] })),
  };
}

// --- v3: dated coursework (events) added, before the transcript existed -----

// v3 Course is identical to the current Course, so we reuse it. NOTE: if a
// future version changes Course, freeze a structural CourseV3 here (as CourseV1/
// CourseV2 do) so "v3 data" doesn't silently drift with the live model.
export interface AppDataV3 {
  version: 3;
  courses: Course[];
}

export function migrateV3(data: AppDataV3): AppDataV4 {
  return { version: 4, courses: data.courses, transcript: [] };
}

// --- v4: transcript added, before per-course status (graded/CR/in-progress) --

/** v4 transcript entry: the current TranscriptEntry minus `status`. */
export interface TranscriptEntryV4 {
  id: string;
  code?: string;
  name: string;
  term: string;
  credits?: number;
  grade?: number;
  source: "import" | "manual" | "course";
  courseId?: string;
}

export interface AppDataV4 {
  version: 4;
  courses: Course[];
  transcript: TranscriptEntryV4[];
}

export function migrateV4(data: AppDataV4): AppData {
  return {
    version: 5,
    courses: data.courses,
    // Guard the array — a hand-edited/partial v4 payload may lack `transcript`;
    // without this, a thrown map() would be swallowed by loadData and wipe data.
    transcript: Array.isArray(data.transcript)
      ? data.transcript.map((e) => ({
          ...e,
          // A v4 entry with a number was graded; without one, treat it as still
          // in progress (a neutral, average-excluded status).
          status: e.grade != null ? ("graded" as const) : ("in-progress" as const),
        }))
      : [],
  };
}

// --- v1: score/max + percentage-vs-points model -----------------------------

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

export function migrateV1(data: AppDataV1): AppDataV2 {
  return { version: 2, courses: data.courses.map(migrateCourse) };
}

function migrateCourse(c: CourseV1): CourseV2 {
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
