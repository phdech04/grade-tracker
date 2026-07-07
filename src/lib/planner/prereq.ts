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
