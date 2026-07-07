import { useRef, useState } from "react";
import type { TranscriptEntry } from "../types";
import { extractTranscript } from "../lib/extractTranscript";
import { graded } from "../lib/transcript";
import { pct } from "../lib/format";

interface Props {
  onCancel: () => void;
  onSave: (entries: TranscriptEntry[]) => void;
}

type Stage =
  | { kind: "input" }
  | { kind: "loading"; label: string }
  | { kind: "review"; entries: TranscriptEntry[] }
  | { kind: "error"; message: string };

export function TranscriptImport({ onCancel, onSave }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "input" });
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(input: File | string, label: string) {
    setStage({ kind: "loading", label });
    try {
      const entries = await extractTranscript(input);
      if (entries.length === 0) {
        setStage({ kind: "error", message: "No courses found in that transcript. Try a clearer copy or add them by hand." });
        return;
      }
      setStage({ kind: "review", entries });
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
            {stage.kind === "review" ? "Review your courses" : "Import transcript"}
          </h2>
          <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-paper-sunk">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(88vh-64px)] overflow-y-auto p-5">
          {stage.kind === "input" && (
            <div>
              <p className="text-sm text-ink-soft">
                Paste your transcript text (select all on your student-portal transcript page and
                copy), or upload a PDF.
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={9}
                placeholder="Paste transcript text here…"
                className="field mt-3 w-full resize-y font-mono text-xs leading-relaxed"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => run(text, "Reading pasted transcript…")}
                  disabled={!text.trim()}
                  className="btn-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Extract courses
                </button>
                <span className="text-xs text-ink-faint">or</span>
                <button onClick={() => fileRef.current?.click()} className="btn-ghost">
                  Upload a PDF or file
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.html,.htm,.txt,application/pdf,text/html,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) run(f, `Reading ${f.name}…`);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {stage.kind === "loading" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-accent" />
              <p className="font-display text-lg font-semibold">{stage.label}</p>
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
              <button onClick={() => setStage({ kind: "input" })} className="btn-ghost">
                Try again
              </button>
            </div>
          )}

          {stage.kind === "review" && (
            <ReviewBody entries={stage.entries} onSave={onSave} onRedo={() => setStage({ kind: "input" })} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewBody({
  entries,
  onSave,
  onRedo,
}: {
  entries: TranscriptEntry[];
  onSave: (entries: TranscriptEntry[]) => void;
  onRedo: () => void;
}) {
  const [rows, setRows] = useState<TranscriptEntry[]>(entries);
  const remove = (id: string) => setRows((r) => r.filter((e) => e.id !== id));
  const gradedCount = graded(rows).length;

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Found {rows.length} course{rows.length === 1 ? "" : "s"} ({gradedCount} with a grade). Remove
        anything that shouldn't be here; you can fine-tune details after saving.
      </p>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-sunk/50 text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">Course</th>
              <th className="px-3 py-2 font-semibold">Term</th>
              <th className="px-3 py-2 text-right font-semibold">Credits</th>
              <th className="px-3 py-2 text-right font-semibold">Grade</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{e.name}</div>
                  {e.code && <div className="text-[11px] text-ink-faint">{e.code}</div>}
                </td>
                <td className="px-3 py-2 text-ink-soft">{e.term || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{e.credits ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {e.grade != null ? pct(e.grade, 0) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(e.id)}
                    className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:text-bad"
                    title="Remove"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onRedo} className="btn-ghost">
          Start over
        </button>
        <button
          onClick={() => onSave(rows)}
          disabled={rows.length === 0}
          className="btn-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add {rows.length} to transcript
        </button>
      </div>
    </div>
  );
}
