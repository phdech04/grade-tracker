import type { Component, Course, DropRule, Item } from "../types";
import { uid } from "./storage";

// Outline extraction. The actual LLM call (Google Gemini) happens server-side in
// /api/extract, which holds the API key — the browser never sees it. This module
// sends the file to that endpoint and maps the returned scheme into a Course
// plus a list of confirmations the user resolves on the review screen.

interface ExtractedComponent {
  name: string;
  weight: number;
  itemCount: number;
  dropKind: "none" | "keepBest" | "dropLowest";
  dropCount: number;
  linkGroupId: string;
}

interface ExtractedConfirmation {
  componentIndex: number; // -1 = course-level
  field: "itemCount" | "weight" | "note";
  question: string;
  suggestion: number;
  choices: number[];
}

interface Extracted {
  name: string;
  code: string;
  term: string;
  components: ExtractedComponent[];
  confirmations: ExtractedConfirmation[];
  hurdles: string[];
  notes: string;
}

export interface Confirmation {
  id: string;
  componentIndex: number | null;
  field: "itemCount" | "weight" | "note";
  question: string;
  suggestion: number;
  choices: number[];
}

export interface ExtractionResult {
  course: Course;
  confirmations: Confirmation[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Strip an HTML document down to readable text to keep token cost low. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, noscript, svg").forEach((el) => el.remove());
  const text = doc.body?.innerText || doc.body?.textContent || "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function makeItems(name: string, count: number, existing: Item[] = []): Item[] {
  const n = Math.max(1, Math.round(count));
  return Array.from({ length: n }, (_, i) =>
    existing[i] ?? { id: uid(), label: n > 1 ? `${name} ${i + 1}` : name },
  );
}

function toComponent(ec: ExtractedComponent): Component {
  let drop: DropRule | undefined;
  if (ec.dropKind === "keepBest" && ec.dropCount > 0) drop = { kind: "keepBest", keep: ec.dropCount };
  else if (ec.dropKind === "dropLowest" && ec.dropCount > 0)
    drop = { kind: "dropLowest", dropLowest: ec.dropCount };

  return {
    id: uid(),
    name: ec.name,
    weight: ec.weight || 0,
    items: makeItems(ec.name, ec.itemCount || 1),
    drop,
    linkGroupId: ec.linkGroupId?.trim() || undefined,
  };
}

function toResult(ex: Extracted): ExtractionResult {
  const course: Course = {
    id: uid(),
    name: ex.name || "Untitled course",
    code: ex.code || undefined,
    term: ex.term || undefined,
    components: (ex.components || []).map(toComponent),
    hurdles: (ex.hurdles || []).filter(Boolean).map((d) => ({ id: uid(), description: d })),
    notes: ex.notes || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const confirmations: Confirmation[] = (ex.confirmations || [])
    .filter((c) => c && c.question)
    .map((c) => ({
      id: uid(),
      componentIndex:
        c.componentIndex >= 0 && c.componentIndex < course.components.length
          ? c.componentIndex
          : null,
      field: c.field === "itemCount" || c.field === "weight" ? c.field : "note",
      question: c.question,
      suggestion: c.suggestion || 0,
      choices: (c.choices || []).filter((n) => Number.isFinite(n) && n > 0),
    }));

  return { course, confirmations };
}

/** Apply the user's confirmation answers (keyed by Confirmation.id) to the course. */
export function applyConfirmations(
  course: Course,
  confirmations: Confirmation[],
  answers: Record<string, number>,
): Course {
  const components = course.components.slice();
  for (const conf of confirmations) {
    if (conf.field === "note" || conf.componentIndex === null) continue;
    const answer = answers[conf.id];
    if (answer === undefined || !(answer > 0)) continue;
    const c = components[conf.componentIndex];
    if (!c) continue;
    if (conf.field === "weight") {
      components[conf.componentIndex] = { ...c, weight: answer };
    } else {
      components[conf.componentIndex] = { ...c, items: makeItems(c.name, answer, c.items) };
    }
  }
  return { ...course, components };
}

export async function extractCourse(file: File): Promise<ExtractionResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let payload: { kind: "pdf"; data: string } | { kind: "text"; text: string };
  if (isPdf) {
    payload = { kind: "pdf", data: await fileToBase64(file) };
  } else {
    const raw = await file.text();
    const text = raw.includes("<") ? htmlToText(raw) : raw;
    payload = { kind: "text", text };
  }

  let res: Response;
  try {
    res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the extraction service. Check your connection.");
  }

  if (res.status === 404) {
    throw new Error(
      "Extraction service not found. Running locally? Use `vercel dev` — plain `npm run dev` doesn't run the /api function.",
    );
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `Extraction failed (${res.status}).`);
  }

  return toResult(json as Extracted);
}
