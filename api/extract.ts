// Vercel serverless function: proxies outline extraction to Google Gemini.
// The Gemini key lives here (process.env.GEMINI_API_KEY) and never reaches the
// browser. The frontend POSTs { kind: "pdf", data } or { kind: "text", text }
// and gets back the extracted grading scheme as JSON.

const MODEL = "gemini-2.5-flash"; // free tier; swap to "gemini-2.0-flash" if needed

const SYSTEM = `You extract grading schemes from university course outlines into a strict JSON structure.

Read the outline and identify every graded assessment category and its weight. Weights are unit-agnostic — use the outline's own numbers:
- Percentage schemes: weight = the category's TOTAL share ("2% each" x3 assignments => itemCount 3, weight 6). Non-linked components should sum to ~100.
- Points-based schemes ("total of 80 points"): weight = the category's total points (8 quizzes x 3 points => itemCount 8, weight 24).
- "best 9 of 11" => itemCount 11, dropKind keepBest, dropCount 9.
- "lowest 2 not counted" => dropKind dropLowest, dropCount 2.
- "midterm OR final, whichever is better" => two components with the same linkGroupId and the same weight.
- Ignore ungraded items (e.g. "Introduce yourself — ungraded").

Never guess silently. When the outline is ambiguous or conflicting, still fill in your best value AND add an entry to confirmations:
- Variable counts ("4-12 pop quizzes"): field "itemCount", componentIndex of that component, suggestion = your estimate, choices [], question quoting the outline.
- Conflicting numbers (a table says 30 but the text says 35): field "weight", choices = the conflicting values, suggestion = the likelier one.
- Ambiguity with no numeric answer: field "note", componentIndex -1, suggestion 0, choices [].
componentIndex is the 0-based index into components, or -1 for course-level notes. Return an empty confirmations array when nothing is ambiguous.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Full course name." },
    code: { type: "STRING", description: "Course code, e.g. AMATH 250. Empty if unknown." },
    term: { type: "STRING", description: "Term, e.g. Spring 2026. Empty if unknown." },
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
              "The category's total share of the final grade, in the outline's own unit (percent or points).",
          },
          itemCount: {
            type: "INTEGER",
            description: "How many individual assessments are in this category. Best estimate for variable counts.",
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
              "Same id on two+ components that are alternatives ('whichever is better'). Empty otherwise. Give linked components the SAME weight.",
          },
        },
        required: ["name", "weight", "itemCount", "dropKind", "dropCount", "linkGroupId"],
        propertyOrdering: ["name", "weight", "itemCount", "dropKind", "dropCount", "linkGroupId"],
      },
    },
    confirmations: {
      type: "ARRAY",
      description: "Questions the user must confirm because the outline was ambiguous or conflicting. Empty when unambiguous.",
      items: {
        type: "OBJECT",
        properties: {
          componentIndex: {
            type: "INTEGER",
            description: "0-based index into components, or -1 for a course-level note.",
          },
          field: {
            type: "STRING",
            enum: ["itemCount", "weight", "note"],
            description: "Which value the answer applies to. 'note' = no numeric answer, just needs acknowledging.",
          },
          question: { type: "STRING", description: "Short question for the user, quoting the outline." },
          suggestion: { type: "NUMBER", description: "Your best-guess answer. 0 for notes." },
          choices: {
            type: "ARRAY",
            items: { type: "NUMBER" },
            description: "The conflicting values when the outline states more than one. Empty otherwise.",
          },
        },
        required: ["componentIndex", "field", "question", "suggestion", "choices"],
        propertyOrdering: ["componentIndex", "field", "question", "suggestion", "choices"],
      },
    },
    hurdles: {
      type: "ARRAY",
      description: "Pass requirements beyond the weighted total. Plain sentences.",
      items: { type: "STRING" },
    },
    notes: { type: "STRING", description: "Any other useful context. Empty if none." },
  },
  required: ["name", "code", "term", "components", "confirmations", "hurdles", "notes"],
  propertyOrdering: ["name", "code", "term", "components", "confirmations", "hurdles", "notes"],
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
