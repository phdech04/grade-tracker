// Vercel serverless function: proxies outline extraction to Google Gemini.
// The Gemini key lives here (process.env.GEMINI_API_KEY) and never reaches the
// browser. The frontend POSTs { kind: "pdf", data } or { kind: "text", text }
// and gets back the extracted grading scheme as JSON.

const MODEL = "gemini-2.5-flash"; // free tier; swap to "gemini-2.0-flash" if needed

const SYSTEM = `You extract grading schemes from university course outlines into a strict JSON structure.

Read the outline and identify every graded assessment category and its weight. Be precise:
- "2% each" with 3 assignments => itemCount 3, weight 6 (percentage mode).
- "best 9 of 11" => itemCount 11, dropKind keepBest, dropCount 9.
- "lowest 2 not counted" => dropKind dropLowest, dropCount 2.
- "midterm OR final, whichever is better" => two components with the same linkGroupId.
- A points-based course ("total of 80 points, grade = your points / 80") => scoreMode points, pointsPerItem set per category, weight 0.
- Ignore ungraded items (e.g. "Introduce yourself — ungraded").
Put the percentage weights so non-linked components sum to ~100. When unsure or estimating (e.g. variable pop-quiz counts), say so in needsReview.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Full course name." },
    code: { type: "STRING", description: "Course code, e.g. AMATH 250. Empty if unknown." },
    term: { type: "STRING", description: "Term, e.g. Spring 2026. Empty if unknown." },
    scoreMode: {
      type: "STRING",
      enum: ["percentage", "points"],
      description:
        "'percentage' when components have percentage weights summing to ~100. 'points' when the whole course is scored out of a point total.",
    },
    components: {
      type: "ARRAY",
      description: "One entry per assessment category in the grading scheme.",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          weight: {
            type: "NUMBER",
            description:
              "percentage mode: this category's TOTAL share of the final grade (e.g. quizzes 7% each x2 => 14). points mode: 0.",
          },
          itemCount: {
            type: "INTEGER",
            description: "How many individual assessments are in this category. Best estimate for variable counts.",
          },
          pointsPerItem: {
            type: "NUMBER",
            description: "points mode: points each item is worth. percentage mode: 100.",
          },
          dropKind: {
            type: "STRING",
            enum: ["none", "keepBest", "dropLowest"],
            description: "'keepBest' for 'best N of M'; 'dropLowest' for 'lowest K not counted'; else 'none'.",
          },
          dropCount: { type: "INTEGER", description: "keepBest => N kept; dropLowest => K dropped; none => 0." },
          linkGroupId: {
            type: "STRING",
            description:
              "Same id on two+ components that are alternatives ('whichever is better'). Empty otherwise. In percentage mode give linked components the SAME weight.",
          },
          needsReview: { type: "STRING", description: "If anything was ambiguous or estimated, explain briefly. Else empty." },
        },
        required: ["name", "weight", "itemCount", "pointsPerItem", "dropKind", "dropCount", "linkGroupId", "needsReview"],
        propertyOrdering: ["name", "weight", "itemCount", "pointsPerItem", "dropKind", "dropCount", "linkGroupId", "needsReview"],
      },
    },
    hurdles: {
      type: "ARRAY",
      description: "Pass requirements beyond the weighted total. Plain sentences.",
      items: { type: "STRING" },
    },
    notes: { type: "STRING", description: "Any other useful context. Empty if none." },
  },
  required: ["name", "code", "term", "scoreMode", "components", "hurdles", "notes"],
  propertyOrdering: ["name", "code", "term", "scoreMode", "components", "hurdles", "notes"],
};

interface Req {
  method?: string;
  body?: { kind?: string; data?: string; text?: string } | string;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({
      error: "Server is missing GEMINI_API_KEY. Add it in your Vercel project settings (or .env.local for `vercel dev`).",
    });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  const parts: Array<Record<string, unknown>> = [];
  if (body.kind === "pdf" && body.data) {
    parts.push({ inline_data: { mime_type: "application/pdf", data: body.data } });
    parts.push({ text: "Extract the grading scheme from this course outline." });
  } else if (body.kind === "text" && typeof body.text === "string") {
    parts.push({ text: `Extract the grading scheme from this course outline:\n\n${body.text.slice(0, 60000)}` });
  } else {
    res.status(400).json({ error: "Send { kind: 'pdf', data } or { kind: 'text', text }." });
    return;
  }

  let gem: Response;
  try {
    gem = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const json: any = await gem.json().catch(() => ({}));
  if (!gem.ok) {
    const msg = json?.error?.message as string | undefined;
    if (gem.status === 429) {
      res.status(429).json({ error: "Gemini free-tier rate limit hit. Wait a minute and try again." });
      return;
    }
    res.status(gem.status).json({ error: msg ? `Gemini error: ${msg}` : `Gemini request failed (${gem.status}).` });
    return;
  }

  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    res.status(502).json({ error: "Gemini returned no grading scheme. Try a different file." });
    return;
  }

  const parsed = safeParse(text);
  if (!parsed) {
    res.status(502).json({ error: "Could not parse Gemini output." });
    return;
  }
  res.status(200).json(parsed);
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
