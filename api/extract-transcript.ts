// Vercel serverless function: extracts completed courses from an academic
// transcript via Google Gemini. Mirrors api/extract.ts (same key handling and
// Gemini call) but with a transcript-specific prompt and schema. Kept separate
// so the outline endpoint stays untouched.

const MODEL = "gemini-2.5-flash";

const SYSTEM = `You extract COMPLETED courses from a university academic transcript into a strict JSON structure.

For every course on the transcript, output one entry with:
- code: the course code as written, e.g. "AMATH 250". Empty if none.
- name: the course title. Empty only if truly absent.
- term: the academic term as "Season YYYY" (e.g. "Fall 2024", "Winter 2026") from the term heading. Do NOT append the level code (like "1A"/"2B") to it. Empty if no term is shown.
- credits: the credit/unit weight from the "Attempted" column as a number (e.g. 0.5, 1). 0 if not shown.
- grade: the raw value in the Grade column, as TEXT — do not convert or invent. A number like "87" for a graded course; "CR" for credit; "NCR" for no-credit; "WD" (also "WF" or "W") for withdrawn; and "" (empty string) when the course has no grade yet because it is currently in progress (common in the most recent term).

Include every listed course in transcript order, including credit/no-credit, withdrawn, and in-progress ones. Do not invent courses or grades. Return an empty entries array if the document has no course list.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    entries: {
      type: "ARRAY",
      description: "One entry per completed course on the transcript, in order.",
      items: {
        type: "OBJECT",
        properties: {
          code: { type: "STRING", description: "Course code as written. Empty if none." },
          name: { type: "STRING", description: "Course title." },
          term: { type: "STRING", description: "Term or level as written. Empty if none." },
          credits: { type: "NUMBER", description: "Credit/unit weight (Attempted column) as a number. 0 if not shown." },
          grade: {
            type: "STRING",
            description:
              "Raw Grade-column value as text: a number like '87', or 'CR' / 'NCR' / 'WD', or '' when in progress.",
          },
        },
        required: ["code", "name", "term", "credits", "grade"],
        propertyOrdering: ["code", "name", "term", "credits", "grade"],
      },
    },
  },
  required: ["entries"],
  propertyOrdering: ["entries"],
};

interface Req {
  method?: string;
  body?: { kind?: string; data?: string; text?: string } | string;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

interface ExtractRequestBody {
  kind?: string;
  data?: string;
  text?: string;
}

interface GeminiResponse {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({
      error: "Server is missing GEMINI_API_KEY. Add it to .env.local (copy .env.example) and restart the dev server — or set it in your Vercel project settings.",
    });
    return;
  }

  const parsedBody: unknown = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const body = (parsedBody as ExtractRequestBody) || {};

  const parts: Array<Record<string, unknown>> = [];
  if (body.kind === "pdf" && body.data) {
    parts.push({ inline_data: { mime_type: "application/pdf", data: body.data } });
    parts.push({ text: "Extract the completed courses from this transcript." });
  } else if (body.kind === "text" && typeof body.text === "string") {
    parts.push({ text: `Extract the completed courses from this transcript:\n\n${body.text.slice(0, 60000)}` });
  } else {
    res.status(400).json({ error: "Send { kind: 'pdf', data } or { kind: 'text', text }." });
    return;
  }

  let gem: Response;
  try {
    gem = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      },
    );
  } catch {
    res.status(502).json({ error: "Could not reach Google. Try again." });
    return;
  }

  const json = (await gem.json().catch(() => ({}))) as GeminiResponse;
  if (!gem.ok) {
    const msg = json.error?.message;
    if (gem.status === 429) {
      res.status(429).json({ error: "Gemini free-tier rate limit hit. Wait a minute and try again." });
      return;
    }
    res.status(gem.status).json({ error: msg ? `Gemini error: ${msg}` : `Gemini request failed (${gem.status}).` });
    return;
  }

  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    res.status(502).json({ error: "Gemini returned no transcript data. Try a different file." });
    return;
  }

  const parsed = safeParse(text);
  if (!parsed) {
    res.status(502).json({ error: "Could not parse Gemini output." });
    return;
  }
  res.status(200).json(parsed);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
