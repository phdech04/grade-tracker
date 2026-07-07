import type { TranscriptEntry } from "../../types";
import { normalizeCode } from "./codes";

// Derive the planner's "where you are now" inputs from the transcript.

/** The 8 study-term levels of a standard co-op BMath degree. */
export const LEVELS = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B"] as const;

/** Course codes the student has passed (graded or CR credit), normalized. */
export function takenFromTranscript(transcript: TranscriptEntry[]): Set<string> {
  const set = new Set<string>();
  for (const e of transcript) {
    if ((e.status === "graded" || e.status === "credit") && e.code) {
      set.add(normalizeCode(e.code));
    }
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
