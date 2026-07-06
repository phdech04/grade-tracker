import type { Component, Course, DropRule, Item } from "../types";
import { uid } from "./storage";

// Outline extraction. The actual LLM call (Google Gemini) happens server-side in
// /api/extract, which holds the API key — the browser never sees it. This module
// sends the file to that endpoint and maps the returned scheme into a Course.

interface ExtractedComponent {
  name: string;
  weight: number;
  itemCount: number;
  pointsPerItem: number;
  dropKind: "none" | "keepBest" | "dropLowest";
  dropCount: number;
  linkGroupId: string;
  needsReview: string;
}

interface Extracted {
  name: string;
  code: string;
  term: string;
  scoreMode: "percentage" | "points";
  components: ExtractedComponent[];
  hurdles: string[];
  notes: string;
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

function toComponent(ec: ExtractedComponent): Component {
  const count = Math.max(1, Math.round(ec.itemCount || 1));
  let drop: DropRule | undefined;
  if (ec.dropKind === "keepBest" && ec.dropCount > 0) drop = { kind: "keepBest", keep: ec.dropCount };
  else if (ec.dropKind === "dropLowest" && ec.dropCount > 0)
    drop = { kind: "dropLowest", dropLowest: ec.dropCount };

  const max = ec.pointsPerItem && ec.pointsPerItem > 0 ? ec.pointsPerItem : 100;
  const items: Item[] = Array.from({ length: count }, (_, i) => ({
    id: uid(),
    label: count > 1 ? `${ec.name} ${i + 1}` : ec.name,
    max,
  }));

  return {
    id: uid(),
    name: ec.name,
    weight: ec.weight || 0,
    items,
    drop,
    linkGroupId: ec.linkGroupId?.trim() || undefined,
    needsReview: ec.needsReview?.trim() || undefined,
  };
}

function toCourse(ex: Extracted): Course {
  return {
    id: uid(),
    name: ex.name || "Untitled course",
    code: ex.code || undefined,
    term: ex.term || undefined,
    scoreMode: ex.scoreMode === "points" ? "points" : "percentage",
    components: (ex.components || []).map(toComponent),
    hurdles: (ex.hurdles || []).filter(Boolean).map((d) => ({ id: uid(), description: d })),
    notes: ex.notes || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function extractCourse(file: File): Promise<Course> {
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

  return toCourse(json as Extracted);
}
