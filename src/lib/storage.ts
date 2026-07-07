import type { AppData, Course, PlanConfig, TranscriptEntry, TranscriptStatus } from "../types";
import {
  migrateV1,
  migrateV2,
  migrateV3,
  migrateV4,
  migrateV5,
  type AppDataV1,
  type AppDataV2,
  type AppDataV3,
  type AppDataV4,
  type AppDataV5,
} from "./migrate";

// The key predates later schema versions; the `version` field inside distinguishes.
const DATA_KEY = "grade-tracker:data:v1";

const empty: AppData = { version: 6, courses: [], transcript: [], plan: { majorIds: [] } };

/** Normalise a v6-shaped payload into clean AppData, backfilling any missing
 * fields (events / transcript status / plan) so hand-edited or partial data
 * can't crash the app downstream. */
function backfillV6(p: { courses?: unknown; transcript?: unknown; plan?: unknown }): AppData {
  const courses = (p.courses as Course[]).map((c) => ({ ...c, events: c.events ?? [] }));
  type MaybeStatus = Omit<TranscriptEntry, "status"> & { status?: TranscriptStatus };
  const transcript = Array.isArray(p.transcript)
    ? (p.transcript as MaybeStatus[]).map(
        (e): TranscriptEntry => ({
          ...e,
          status: e.status ?? (e.grade != null ? "graded" : "in-progress"),
        }),
      )
    : [];
  const rawPlan = p.plan as PlanConfig | undefined;
  const plan: PlanConfig = { majorIds: Array.isArray(rawPlan?.majorIds) ? rawPlan.majorIds : [] };
  return { version: 6, courses, transcript, plan };
}

function coerce(parsed: unknown): AppData | null {
  const p = parsed as { version?: number; courses?: unknown };
  if (!p || !Array.isArray(p.courses)) return null;
  // migrateVN do the structural version bumps; backfillV6 does the defensive
  // field backfills once at the end.
  if (p.version === 6) return backfillV6(p);
  if (p.version === 5) return backfillV6(migrateV5(p as AppDataV5));
  if (p.version === 4) return backfillV6(migrateV5(migrateV4(p as AppDataV4)));
  if (p.version === 3) return backfillV6(migrateV5(migrateV4(migrateV3(p as AppDataV3))));
  if (p.version === 2) return backfillV6(migrateV5(migrateV4(migrateV3(migrateV2(p as AppDataV2)))));
  if (p.version === 1)
    return backfillV6(migrateV5(migrateV4(migrateV3(migrateV2(migrateV1(p as AppDataV1))))));
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
