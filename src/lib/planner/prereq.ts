import type { PrereqExpr } from "./types";

// Boolean prerequisite evaluation over the set of course codes a student has.
// Codes are compared in canonical spaced form ("MATH 237").

/** Does the taken set satisfy this prerequisite expression? Empty expr = yes. */
export function satisfied(expr: PrereqExpr | undefined | null, taken: Set<string>): boolean {
  if (!expr) return true;
  if ("course" in expr) return taken.has(expr.course);
  if ("all" in expr) return expr.all.every((e) => satisfied(e, taken));
  if ("oneOf" in expr) return expr.oneOf.some((e) => satisfied(e, taken));
  return expr.nOf.of.filter((e) => satisfied(e, taken)).length >= expr.nOf.n;
}

/**
 * Minimal set of extra courses (beyond `have`) needed to satisfy an expression,
 * considering ONLY courses that exist in the catalog (`catalogCodes`). Returns
 * null when the expression can't be satisfied with catalog courses — so callers
 * never pull uncatalogued/un-schedulable codes into a plan.
 */
export function closure(
  expr: PrereqExpr | undefined | null,
  have: Set<string>,
  catalogCodes: Set<string>,
): string[] | null {
  if (!expr || satisfied(expr, have)) return [];
  if ("course" in expr) return catalogCodes.has(expr.course) ? [expr.course] : null;
  if ("all" in expr) {
    const parts = expr.all.map((e) => closure(e, have, catalogCodes));
    if (parts.some((p) => p === null)) return null;
    return (parts as string[][]).flat();
  }
  const branches = "oneOf" in expr ? expr.oneOf : expr.nOf.of;
  const n = "oneOf" in expr ? 1 : expr.nOf.n;
  const feasible = branches
    .map((b) => closure(b, have, catalogCodes))
    .filter((p): p is string[] => p !== null);
  if (feasible.length < n) return null;
  return feasible.sort((a, b) => a.length - b.length).slice(0, n).flat();
}

/** Every course code referenced anywhere in the expression (deduped). */
export function prereqCourses(expr: PrereqExpr | undefined | null): string[] {
  if (!expr) return [];
  let out: string[];
  if ("course" in expr) out = [expr.course];
  else if ("all" in expr) out = expr.all.flatMap(prereqCourses);
  else if ("oneOf" in expr) out = expr.oneOf.flatMap(prereqCourses);
  else out = expr.nOf.of.flatMap(prereqCourses);
  return [...new Set(out)];
}
