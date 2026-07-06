import type { AppData, Course } from "../types";

const DATA_KEY = "grade-tracker:data:v1";

const empty: AppData = { version: 1, courses: [] };

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as AppData;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.courses)) return parsed;
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
  const parsed = JSON.parse(text) as AppData;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.courses)) {
    throw new Error("Not a valid Grade Tracker backup file.");
  }
  return parsed;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
