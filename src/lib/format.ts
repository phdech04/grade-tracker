export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** Map a grade to a semantic colour token value. */
export function gradeColor(v: number | null): string {
  if (v === null) return "#8a847c";
  if (v >= 80) return "#3f7d4e";
  if (v >= 65) return "#b78514";
  if (v >= 50) return "#b4541f";
  return "#b03a2e";
}
