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
