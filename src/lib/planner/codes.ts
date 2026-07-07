// Course-code helpers shared by the planner.

/** Math-faculty subjects (their units count toward the "math units" minimum). */
const MATH_SUBJECTS = new Set([
  "MATH", "AMATH", "PMATH", "STAT", "CO", "ACTSC", "CS", "CM", "MATBUS", "MTHEL",
]);

/** Normalise a code to canonical spaced upper form: "cs136" -> "CS 136". */
export function normalizeCode(raw: string): string {
  const m = /^\s*([A-Za-z]+)\s*0*(\d+[A-Za-z]?)\s*$/.exec(raw || "");
  if (!m) return (raw || "").trim().toUpperCase();
  return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
}

/** Split a code into its subject and numeric level, e.g. "AMATH 445" -> {AMATH, 445}. */
export function parseCode(code: string): { subject: string; number: number } | null {
  const m = /^([A-Za-z]+)\s*(\d+)/.exec(normalizeCode(code));
  if (!m) return null;
  return { subject: m[1].toUpperCase(), number: Number(m[2]) };
}

export function isMathSubject(code: string): boolean {
  const p = parseCode(code);
  return p != null && MATH_SUBJECTS.has(p.subject);
}
