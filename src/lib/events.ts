import type { EventKind } from "../types";

// Shared labels/options for CourseEvent kinds, used by the deadline UI and the
// import review. Kept out of any component file so fast-refresh stays happy.

export const KIND_OPTIONS: { value: EventKind; label: string }[] = [
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "lab", label: "Lab" },
  { value: "other", label: "Other" },
];

export const KIND_LABEL: Record<EventKind, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
  project: "Project",
  lab: "Lab",
  other: "Task",
};
