# Tally — grade tracker

Upload a course outline (PDF or HTML), Tally extracts the grading scheme with
Google Gemini (read server-side, so no key in the browser), and you track marks +
projections as the term goes. Courses and marks live in your browser
(`localStorage`); back them up with the JSON export in Settings.

## Setup

You need a free Gemini API key for the extraction step. Get one at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) (no credit card),
then expose it as `GEMINI_API_KEY`:

```bash
npm install
cp .env.example .env.local        # then put your key in .env.local
```

## Run locally

```bash
npx vercel dev     # runs the app AND the /api/extract function (needs the key)
npm test           # grade-engine unit tests (Vitest)
npm run build      # production build to dist/
```

> `npm run dev` (plain Vite) serves the UI but **not** the `/api/extract`
> function, so uploads won't work there — use `vercel dev` for the full app.

## Deploy to Vercel

1. Push this folder to a Git repo and import it in Vercel (framework preset
   **Vite** is auto-detected; build `npm run build`, output `dist`; the `/api`
   folder becomes a serverless function automatically). Or run `npx vercel` from
   here.
2. In the Vercel project → **Settings → Environment Variables**, add
   `GEMINI_API_KEY` with your key.
3. Redeploy. The site reads outlines with your key; visitors enter nothing.

Note: the deployed key is shared by anyone who uses the site. Gemini's free tier is
rate-limited and free, so the worst case is hitting a daily limit. To lock it down
further, restrict the key by HTTP referrer in Google AI Studio / Cloud Console.

## How it works

- `api/extract.ts` — Vercel serverless function. Holds `GEMINI_API_KEY`, calls
  Gemini (`gemini-2.5-flash`) with a structured-output schema, returns the scheme.
- `src/lib/extract.ts` — POSTs the file to `/api/extract` and maps the result into
  a course template (PDF sent as base64; HTML stripped to text first).
- `src/lib/grades.ts` — the calculation engine. Per-item weights, best-N-of-M /
  drop-lowest, "whichever is better" linked components, points-based courses.
  Covered by `src/lib/grades.test.ts`.
- `src/lib/storage.ts` — `localStorage` persistence + JSON export/import.
- `src/components/` — dashboard, course detail, import/review, settings.
