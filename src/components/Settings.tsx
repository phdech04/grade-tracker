import { useRef, useState } from "react";
import type { AppData } from "../types";
import { exportData, importData } from "../lib/storage";

interface Props {
  data: AppData;
  onImportData: (d: AppData) => void;
}

export function Settings({ data, onImportData }: Props) {
  const [importErr, setImportErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="max-w-2xl">
      <p className="label text-accent">Settings</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Setup &amp; data</h1>

      <section className="card mt-7 p-5">
        <h2 className="font-display text-lg font-semibold">Reading outlines</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Uploaded outlines are read by Google Gemini through this app's own server — there's no key
          to enter and nothing to set up. Just upload a PDF or HTML outline and review what comes
          back.
        </p>
      </section>

      <section className="card mt-5 p-5">
        <h2 className="font-display text-lg font-semibold">Backup &amp; restore</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Your {data.courses.length} course{data.courses.length === 1 ? "" : "s"} and all marks live
          in this browser. Export a file to keep them safe or move to another device.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => exportData(data)} className="btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export backup
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost">
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setImportErr("");
              try {
                const d = await importData(f);
                if (
                  data.courses.length === 0 ||
                  confirm("Replace your current courses with this backup?")
                ) {
                  onImportData(d);
                }
              } catch (err) {
                setImportErr(err instanceof Error ? err.message : "Could not import that file.");
              } finally {
                e.target.value = "";
              }
            }}
          />
        </div>
        {importErr && <p className="mt-2 text-xs text-bad">{importErr}</p>}
      </section>

      <p className="mt-6 text-center text-xs text-ink-faint">
        Tally · a quiet ledger for your marks
      </p>
    </div>
  );
}
