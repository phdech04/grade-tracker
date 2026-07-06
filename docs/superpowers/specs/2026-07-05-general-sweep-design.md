# Tally general sweep — design

Date: 2026-07-05
Status: approved pending user review

## Goal

One cleanup pass over the whole app that makes it simpler to use and simpler inside:

1. Marks are entered as **percentages only** — the user never converts a test score
   into a share of course weight again.
2. The data model unifies to a **single weight-based scheme** — the
   `% weighted / points` toggle disappears.
3. The course page gets a **view/edit split** — a quiet reading view where only
   score inputs are live, and a page-level Edit mode that reveals all structure
   editing.
4. Extraction ambiguity is **confirmed at import time** — no lingering warning
   banners on the course page.
5. The dashboard gains a **term overview strip** (projected term average, %
   graded, on-track count) with optional per-course credits.
6. **Letter grades are removed** everywhere; percentages are the only grade
   language. Grade colors stay.
7. The "Link" text field becomes a real **better-of pairing control**, and the
   view shows which side of a pair is currently counting.

Non-goals: GPA scales, letter-grade configuration, multi-term support, any
backend/storage change beyond localStorage versioning.

## 1. Data model v2 (`src/types.ts`)

```ts
export interface Item {
  id: string;
  label: string;
  /** Percentage earned on this item, e.g. 88 for 88%. >100 allowed (bonus). undefined = ungraded. */
  score?: number;
}

export type DropRule =
  | { kind: "keepBest"; keep: number }
  | { kind: "dropLowest"; dropLowest: number };

export interface Component {
  id: string;
  name: string;
  /**
   * This component's share of the final grade, in whatever unit the syllabus
   * uses (percent or points). The engine normalizes: grade = earned / total,
   * so only ratios matter.
   */
  weight: number;
  items: Item[];
  drop?: DropRule;
  /** Components sharing a linkGroupId form a "whichever is better" group. */
  linkGroupId?: string;
}

export interface Hurdle { id: string; description: string }

export interface Course {
  id: string;
  name: string;
  code?: string;
  term?: string;
  targetGrade?: number;
  /** Optional credit weight for the term average. */
  credits?: number;
  components: Component[];
  hurdles: Hurdle[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppData { version: 2; courses: Course[] }
```

Removed from v1: `ScoreMode`, `Course.scoreMode`, `Item.max`,
`Component.needsReview`. Added: `Course.credits`.

## 2. Engine (`src/lib/grades.ts`)

Behavior-preserving simplification:

- Each component's weight is split evenly across its counting slots
  (`perSlot = weight / countTarget`); a graded item earns `(score / 100) * perSlot`.
  The `mode === "points"` branch and all `Item.max` handling are deleted.
- Drop rules, link-group resolution (try every selection, keep the max),
  `gradeSummary` (current / weightCompleted / projected / bestCase / worstCase),
  and `requiredAverage` keep their exact semantics.
- `totalWeight` stays for validation display.
- New helper `normalizedWeight(course, component)` → component share of the full
  denominator as a %, used wherever the UI shows a weight chip when the course
  total is not ~100.

## 3. Migration (`src/lib/storage.ts`)

`loadData()` migrates v1 → v2 in place, then saves. Grades must be identical
before and after.

- Every item: `score` becomes `(score / max) * 100` (undefined stays undefined);
  `max` dropped.
- Percentage-mode component: `weight` unchanged.
- Points-mode component: `weight = countTarget(drop, n) * avgMax`, where
  `avgMax` is the mean max across **all** items. For components with uniform
  item maxes (every extractor-built course) this preserves grades exactly.
  (v1 derived per-slot weight from *graded* items only, so mixed-max components
  with partial grading were inconsistent in v1 itself; mean-of-all is the sane
  fix, not a regression.)
- `scoreMode` and `needsReview` dropped. `version: 2`.
- Unrecognized/corrupt data falls back to empty AppData as today.

Settings export/import (backup JSON) round-trips v2; importing a v1 backup runs
the same migration.

## 4. Course page (`src/components/CourseDetail.tsx`)

### View mode (default)

- Header: code / term / course name as **static text**. No Delete button in the
  header. An **Edit** button (ghost style) sits top-right.
- Component card: name + weight chip (`15%`, or `27.5 → 29% of grade` styling
  via `normalizedWeight` when totals ≠ 100) + item rows.
- Item row: static label · score input · `%`. The score input is the **only**
  interactive element in view mode. Behavior: numeric, any non-negative value
  (above 100 = bonus), empty = ungraded, select-all on focus; every keystroke recomputes the summary
  (existing `useMemo` reactivity — the ring, projections, and target solver
  update live with the existing eased animation).
- Passive footnotes in small muted text where applicable: drop rule
  ("drop lowest 2", "best 9 of 11 count"), graded progress ("4 of 9 graded").
- Better-of pairs render as one visually joined card group labeled
  "whichever is better counts", with a ✓ marker on the member currently winning
  (from the engine's chosen selection).
- Hurdles: static bulleted list.
- No × buttons, no add buttons, no selects, no rename inputs anywhere.

### Edit mode

Toggled by the header button (label flips to **Done**). Edits apply live —
the mode only gates visibility. Reveals:

- Course code / term / name / credits inputs.
- Per component: rename, weight input, add/remove/rename items, per-item ×,
  drop-rule select + count, better-of pairing, component ×.
- "Add component" button.
- Hurdles: editable rows, × per row, "Add requirement".
- **Delete course** as a danger button at the bottom of the page.

### Better-of pairing control (edit mode)

A "Better of…" dropdown per component listing every other component plus "—".
Selecting component B pairs A and B (both get one generated `linkGroupId`);
selecting "—" unpairs. The UI supports pairs (2 members); the engine still
handles larger groups if imported data has them.

### Sidebar

Standing card + Target solver stay. The permanent explanatory paragraphs shrink
to an ⓘ tooltip. Points-mode footnote deleted (no modes).

## 5. Import flow (`api/extract.ts`, `src/lib/extract.ts`, `src/components/ImportReview.tsx`)

### Extractor schema (v2)

Per component: `name, weight, itemCount, dropKind, dropCount, linkGroupId`
(no `scoreMode`, no `pointsPerItem`; for points-based courses the weight is the
category's point total). New top-level array:

```ts
confirmations: Array<{
  componentIndex: number | null; // null = course-level
  field: "itemCount" | "weight" | "note";
  question: string;      // "How many pop quizzes will there be? The outline says 4–12."
  suggestion: number;    // prefill (0 for notes)
  choices: number[];     // alternative values when the outline conflicts; empty otherwise
}>
```

The system prompt instructs: emit a confirmation instead of guessing silently;
use `choices` when the outline states conflicting values (e.g. table says 30,
text says 35); use `field: "note"` only when nothing numeric can be applied.

### Review screen

Scheme table as today (weight column always shown, unit-agnostic), plus a
**"Confirm these"** block when confirmations exist:

- `itemCount` / `weight` questions: the question text with a numeric input
  prefilled with `suggestion`; if `choices` is non-empty, render the choices as
  quick-pick chips plus the free input.
- `note` questions: checkbox acknowledgment.
- **Save & open** stays enabled (suggestions are valid answers) and applies all
  answers to the built course: item lists are regenerated to the confirmed
  count, weights overwritten. Nothing ambiguous is persisted — `needsReview`
  no longer exists.

## 6. Dashboard & term overview (`src/components/Dashboard.tsx`)

- Empty state: current hero + upload CTA, unchanged.
- With courses: hero is replaced by a **term summary strip**:
  - **Projected average** — mean of each course's projected grade, weighted by
    `credits` (courses with no credits count as 1); courses with nothing graded
    are excluded.
  - **Graded so far** — same weighting over `weightCompleted`.
  - **On track** — "3 of 5 courses on target" counting courses with a target
    where projected ≥ target; omitted if no course has a target.
- "Add manually" / "Upload outline" buttons move into the strip's row.
- Course cards unchanged apart from letter-grade removal.

## 7. Letter grade removal (`src/lib/format.ts`, `src/components/GradeRing.tsx`)

- `letterGrade()` deleted; all call sites updated.
- `GradeRing` center: big rounded number with a small `%` beneath (or the
  explicit `label` prop). Null grade still renders "—".
- Standing card copy: "82% so far, with 11% of the grade in" (no letter).
- `gradeColor` thresholds unchanged.

## 8. Visual sweep

While touching each screen: consistent chip/footnote styles, typography rules
(real minus/en-dashes, tabular numerals — already largely present), no layout
rearchitecture beyond what sections 4–6 describe.

## 9. Testing (`src/lib/grades.test.ts` + new)

- Engine tests rewritten for percent-only items: even split, drop rules,
  link groups, projections, target solver, weights not summing to 100.
- Migration tests: a v1 percentage-mode course and a v1 points-mode course
  (mirroring the real AMATH 250 data: 0.83/1 quizzes, 27.5-pt midterm) produce
  identical `gradeSummary` output after migration; drop-rule + points-mode
  combination preserves the denominator.
- Confirmation application test: answers regenerate item counts / weights
  correctly in `extract.ts` mapping.
- Existing runner (`npm test` / vitest) — no new tooling.

## Rollout

Single release; migration is automatic on first load. No feature flags. The
extractor schema change ships in the same deploy (frontend and `/api/extract`
deploy together on Vercel).
