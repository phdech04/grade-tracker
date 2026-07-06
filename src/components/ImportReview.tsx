import { useState } from "react";
import type { Course } from "../types";
import {
  applyConfirmations,
  extractCourse,
  type ExtractionResult,
} from "../lib/extract";
import { totalWeight } from "../lib/grades";

interface Props {
  onCancel: () => void;
  onSave: (course: Course) => void;
}

type Stage =
  | { kind: "drop" }
  | { kind: "loading"; name: string }
  | { kind: "review"; result: ExtractionResult }
  | { kind: "error"; message: string };

export function ImportReview({ onCancel, onSave }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "drop" });
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setStage({ kind: "loading", name: file.name });
    try {
      const result = await extractCourse(file);
      setStage({ kind: "review", result });
    } catch (e) {
      setStage({ kind: "error", message: e instanceof Error ? e.message : "Extraction failed." });
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="card relative z-10 max-h-[88vh] w-full max-w-2xl overflow-hidden bg-paper-card shadow-lift">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <h2 className="font-display text-xl font-semibold">
            {stage.kind === "review" ? "Review the grading scheme" : "Upload a course outline"}
          </h2>
          <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-paper-sunk">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(88vh-64px)] overflow-y-auto p-5">
          {stage.kind === "drop" && (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl2 border-2 border-dashed px-6 py-14 text-center transition ${
                dragOver ? "border-accent bg-accent-wash" : "border-line bg-paper-sunk/40 hover:border-accent/50"
              }`}
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-wash text-accent">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <div>
                <p className="font-display text-lg font-semibold">Drop your outline here</p>
                <p className="mt-0.5 text-sm text-ink-soft">PDF or HTML · or click to browse</p>
              </div>
              <input
                type="file"
                accept=".pdf,.html,.htm,application/pdf,text/html"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          )}

          {stage.kind === "loading" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <Spinner />
              <div>
                <p className="font-display text-lg font-semibold">Reading {stage.name}…</p>
                <p className="mt-0.5 text-sm text-ink-soft">Pulling out components and weights.</p>
              </div>
            </div>
          )}

          {stage.kind === "error" && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-bad/10 text-bad">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4M12 17h.01M10.3 3.86l-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.44l-8.5-14.7a2 2 0 0 0-3.4 0z" />
                </svg>
              </div>
              <p className="max-w-sm text-sm text-ink-soft">{stage.message}</p>
              <button onClick={() => setStage({ kind: "drop" })} className="btn-ghost">
                Try another file
              </button>
            </div>
          )}

          {stage.kind === "review" && (
            <ReviewBody
              result={stage.result}
              onChangeName={(name) =>
                setStage({
                  kind: "review",
                  result: { ...stage.result, course: { ...stage.result.course, name } },
                })
              }
              onSave={(course) => onSave(course)}
              onRedo={() => setStage({ kind: "drop" })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewBody({
  result,
  onChangeName,
  onSave,
  onRedo,
}: {
  result: ExtractionResult;
  onChangeName: (name: string) => void;
  onSave: (course: Course) => void;
  onRedo: () => void;
}) {
  const { course, confirmations } = result;
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      confirmations.filter((c) => c.field !== "note").map((c) => [c.id, c.suggestion]),
    ),
  );
  const [acked, setAcked] = useState<Record<string, boolean>>({});

  const notes = confirmations.filter((c) => c.field === "note");
  const numeric = confirmations.filter((c) => c.field !== "note");
  const allAcked = notes.every((c) => acked[c.id]);
  const tw = totalWeight(course);

  return (
    <div>
      <div className="mb-4">
        <p className="label">Course</p>
        <input
          value={course.name}
          onChange={(e) => onChangeName(e.target.value)}
          className="mt-1 w-full bg-transparent font-display text-2xl font-semibold outline-none"
        />
        <p className="text-sm text-ink-faint">
          {[course.code, course.term].filter(Boolean).join(" · ") || "Detected from the outline"}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-sunk/50 text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">Component</th>
              <th className="px-3 py-2 text-center font-semibold">Items</th>
              <th className="px-3 py-2 text-center font-semibold">Rule</th>
              <th className="px-3 py-2 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {course.components.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  {c.linkGroupId && (
                    <div className="text-[11px] text-accent">whichever is better</div>
                  )}
                </td>
                <td className="px-3 py-2 text-center tabular-nums text-ink-soft">{c.items.length}</td>
                <td className="px-3 py-2 text-center text-xs text-ink-soft">
                  {c.drop?.kind === "keepBest"
                    ? `best ${c.drop.keep}`
                    : c.drop?.kind === "dropLowest"
                      ? `drop ${c.drop.dropLowest}`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-right font-display font-semibold tabular-nums">
                  {c.weight}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Weights total {tw % 1 ? tw.toFixed(1) : tw}
        {Math.abs(tw - 100) < 0.5 ? "%" : " — treated as shares of the total"}
      </p>

      {confirmations.length > 0 && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent-wash/50 p-4">
          <p className="label text-accent">Confirm these</p>
          <div className="mt-2 space-y-3">
            {numeric.map((conf) => (
              <div key={conf.id}>
                <p className="text-sm text-ink-soft">
                  {conf.componentIndex !== null && (
                    <span className="font-semibold">
                      {course.components[conf.componentIndex]?.name}:{" "}
                    </span>
                  )}
                  {conf.question}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {conf.choices.map((choice) => (
                    <button
                      key={choice}
                      onClick={() => setAnswers((a) => ({ ...a, [conf.id]: choice }))}
                      className={`rounded-full border px-2.5 py-0.5 text-sm tabular-nums transition ${
                        answers[conf.id] === choice
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-paper-card text-ink-soft hover:border-accent/50"
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    value={answers[conf.id] ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [conf.id]: Number(e.target.value) }))
                    }
                    className="w-20 rounded-md border border-line bg-paper-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-accent"
                  />
                </div>
              </div>
            ))}
            {notes.map((conf) => (
              <label key={conf.id} className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={acked[conf.id] ?? false}
                  onChange={(e) => setAcked((a) => ({ ...a, [conf.id]: e.target.checked }))}
                  className="mt-0.5 accent-accent"
                />
                <span>{conf.question}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {course.hurdles.length > 0 && (
        <div className="mt-3 rounded-lg bg-paper-sunk/50 px-3 py-2 text-xs text-ink-soft">
          <span className="font-semibold">Pass requirements: </span>
          {course.hurdles.map((h) => h.description).join(" · ")}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        Looks off? Save and fine-tune every field on the course page.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onRedo} className="btn-ghost">
          Re-upload
        </button>
        <button
          onClick={() => onSave(applyConfirmations(course, confirmations, answers))}
          disabled={!allAcked}
          className="btn-accent disabled:cursor-not-allowed disabled:opacity-50"
          title={allAcked ? undefined : "Tick the checkboxes above first"}
        >
          Save &amp; open
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-accent" />
  );
}
