import type { AppData, Course, TranscriptEntry } from "../types";
import {
  migrateV1,
  migrateV2,
  migrateV3,
  type AppDataV1,
  type AppDataV2,
  type AppDataV3,
} from "./migrate";

// The key predates later schema versions; the `version` field inside distinguishes.
const DATA_KEY = "grade-tracker:data:v1";

const empty: AppData = { version: 4, courses: [], transcript: [] };

function coerce(parsed: unknown): AppData | null {
  const p = parsed as { version?: number; courses?: unknown; transcript?: unknown };
  if (!p || !Array.isArray(p.courses)) return null;
  if (p.version === 4) {
    // Backfill defensively — a hand-edited or partial payload may lack a field,
    // and the app assumes course.events and top-level transcript are arrays.
    const courses = (p.courses as Course[]).map((c) => ({ ...c, events: c.events ?? [] }));
    const transcript = (p.transcript as TranscriptEntry[] | undefined) ?? [];
    return { version: 4, courses, transcript };
  }
  if (p.version === 3) return migrateV3(p as AppDataV3);
  if (p.version === 2) return migrateV3(migrateV2(p as AppDataV2));
  if (p.version === 1) return migrateV3(migrateV2(migrateV1(p as AppDataV1)));
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
