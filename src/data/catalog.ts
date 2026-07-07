import type { CatalogCourse } from "../lib/planner/types";
import { COURSES } from "./courses";
import { PREREQS } from "./prereqs";

// The course catalog with prerequisite data merged in. `courses.ts` holds the
// identity/units/cross-list; `prereqs.ts` holds the boolean prereqs/antireqs/
// terms-offered. Kept separate so each can be curated independently.
export const CATALOG: CatalogCourse[] = COURSES.map((c) => ({ ...c, ...(PREREQS[c.code] ?? {}) }));
