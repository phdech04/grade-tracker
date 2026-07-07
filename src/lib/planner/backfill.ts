import type { TranscriptEntry } from "../../types";
import { compareTerms } from "../transcript";
import { normalizeCode } from "./codes";

// Derive the planner's "where you are now" inputs from the transcript.

/** The 8 study-term levels of a standard co-op BMath degree. */
export const LEVELS = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B"] as const;

/** Waterloo's passing grade. */
const PASS = 50;

/** Course codes the student has passed — a CR credit, or a graded ≥ 50%. */
export function takenFromTranscript(transcript: TranscriptEntry[]): Set<string> {
  const set = new Set<string>();
  for (const e of transcript) {
    if (!e.code) continue;
    const passed = e.status === "credit" || (e.status === "graded" && (e.grade ?? 0) >= PASS);
    if (passed) set.add(normalizeCode(e.code));
  }
  return set;
}

/**
 * Number of completed study terms — distinct terms that contain at least one
 * graded academic course. Co-op work terms (CR-only) don't count.
 */
export function completedStudyTerms(transcript: TranscriptEntry[]): number {
  const terms = new Set<string>();
  for (const e of transcript) {
    if (e.status === "graded" && e.term) terms.add(e.term);
  }
  return terms.size;
}

/** Remaining study terms in a standard 8-term degree (never negative). */
export function remainingStudyTerms(transcript: TranscriptEntry[]): number {
  return Math.max(0, LEVELS.length - completedStudyTerms(transcript));
}

export interface PastTerm {
  level: string;
  courses: string[];
}

/**
 * The student's completed study terms mapped onto the level skeleton (1A, 1B, …)
 * with the passed course codes in each. Terms with no graded course (pure co-op
 * work terms) are skipped.
 */
export function pastStudyTerms(transcript: TranscriptEntry[]): PastTerm[] {
  const byTerm = new Map<string, { hasGraded: boolean; codes: string[] }>();
  const order: string[] = [];
  for (const e of transcript) {
    if (!e.code) continue;
    const passed = e.status === "credit" || (e.status === "graded" && (e.grade ?? 0) >= 50);
    if (!passed) continue;
    let g = byTerm.get(e.term);
    if (!g) {
      g = { hasGraded: false, codes: [] };
      byTerm.set(e.term, g);
      order.push(e.term);
    }
    g.codes.push(normalizeCode(e.code));
    if (e.status === "graded") g.hasGraded = true;
  }
  const studyTerms = order.filter((t) => byTerm.get(t)!.hasGraded).sort(compareTerms);
  return studyTerms.map((term, i) => ({
    level: LEVELS[i] ?? `Term ${i + 1}`,
    courses: byTerm.get(term)!.codes,
  }));
}
