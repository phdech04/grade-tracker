import type { TranscriptEntry, TranscriptStatus } from "../types";
import { uid } from "./storage";

// Client side of transcript extraction: send a transcript file or pasted text
// to /api/extract-transcript (which holds the Gemini key) and map the result
// into TranscriptEntry[]. Mirrors src/lib/extract.ts.

interface ExtractedTranscriptEntry {
  code: string;
  name: string;
  term: string;
  credits: number;
  /** Raw Grade-column token: a number, "CR"/"NCR"/"WD", or "" for in-progress. */
  grade: string;
}

/** Classify a raw transcript grade token into a status and (if graded) a percentage. */
export function classifyGrade(token: string): { status: TranscriptStatus; grade?: number } {
  const t = String(token ?? "").trim().toUpperCase();
  if (t === "") return { status: "in-progress" };
  const n = Number(t);
  if (Number.isFinite(n) && t !== "") {
    return { status: "graded", grade: Math.min(100, Math.max(0, n)) };
  }
  if (t === "CR") return { status: "credit" };
  if (t === "NCR" || t === "NC") return { status: "no-credit" };
  if (t === "WD" || t === "WF" || t === "W") return { status: "withdrawn" };
  // Anything else non-numeric (IP, IN, INC, DNW, …) → treat as in progress.
  return { status: "in-progress" };
}

/** Raw shape returned by /api/extract-transcript. Exported for unit tests. */
export interface ExtractedTranscript {
  entries: ExtractedTranscriptEntry[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, noscript, svg").forEach((el) => el.remove());
  const text = doc.body?.innerText || doc.body?.textContent || "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Map the raw extraction into transcript entries (drops blank-name rows). The
 * Grade column is a text token classified into a status: numbers → graded (and
 * clamped 0–100), "CR"/"NCR"/"WD" → their statuses, "" → in-progress.
 */
export function toTranscript(ex: ExtractedTranscript): TranscriptEntry[] {
  return (ex.entries || [])
    .filter((e) => e && (e.name || "").trim())
    .map((e) => {
      const { status, grade } = classifyGrade(e.grade);
      return {
        id: uid(),
        code: (e.code || "").trim() || undefined,
        name: (e.name || "").trim(),
        term: (e.term || "").trim(),
        credits: typeof e.credits === "number" && e.credits > 0 ? e.credits : undefined,
        grade,
        status,
        source: "import" as const,
      };
    });
}

async function postTranscript(
  payload: { kind: "pdf"; data: string } | { kind: "text"; text: string },
): Promise<TranscriptEntry[]> {
  let res: Response;
  try {
    res = await fetch("/api/extract-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the extraction service. Check your connection.");
  }

  if (res.status === 404) {
    throw new Error(
      "Extraction service not found. Restart the dev server (`npm run dev`) or check that /api/extract-transcript is deployed.",
    );
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `Extraction failed (${res.status}).`);
  }
  return toTranscript(json as ExtractedTranscript);
}

/** Extract transcript entries from a file (PDF/HTML/text) or pasted text. */
export async function extractTranscript(input: File | string): Promise<TranscriptEntry[]> {
  if (typeof input === "string") {
    return postTranscript({ kind: "text", text: input });
  }
  const isPdf =
    input.type === "application/pdf" || input.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return postTranscript({ kind: "pdf", data: await fileToBase64(input) });
  }
  const raw = await input.text();
  const text = raw.includes("<") ? htmlToText(raw) : raw;
  return postTranscript({ kind: "text", text });
}
