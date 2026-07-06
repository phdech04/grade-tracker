import { useEffect, useMemo, useState } from "react";
import type { AppData, Course } from "./types";
import { deleteCourse, loadData, saveData, uid, upsertCourse } from "./lib/storage";
import { Dashboard } from "./components/Dashboard";
import { CourseDetail } from "./components/CourseDetail";
import { ImportReview } from "./components/ImportReview";
import { Settings } from "./components/Settings";

type View = { kind: "dashboard" } | { kind: "course"; id: string } | { kind: "settings" };

function blankCourse(): Course {
  return {
    id: uid(),
    name: "New course",
    components: [],
    hurdles: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [importing, setImporting] = useState(false);

  useEffect(() => saveData(data), [data]);

  const current = useMemo(
    () => (view.kind === "course" ? data.courses.find((c) => c.id === view.id) : undefined),
    [view, data],
  );

  function commit(course: Course) {
    setData((d) => upsertCourse(d, course));
  }

  function remove(id: string) {
    setData((d) => deleteCourse(d, id));
    setView({ kind: "dashboard" });
  }

  return (
    <div className="min-h-screen">
      <Header
        onHome={() => setView({ kind: "dashboard" })}
        onSettings={() => setView({ kind: "settings" })}
        active={view.kind}
      />

      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-8 sm:px-8">
        {view.kind === "dashboard" && (
          <Dashboard
            courses={data.courses}
            onOpen={(id) => setView({ kind: "course", id })}
            onImport={() => setImporting(true)}
            onNewBlank={() => {
              const c = blankCourse();
              commit(c);
              setView({ kind: "course", id: c.id });
            }}
          />
        )}

        {view.kind === "course" && current && (
          <CourseDetail
            course={current}
            onChange={commit}
            onDelete={() => remove(current.id)}
            onBack={() => setView({ kind: "dashboard" })}
          />
        )}

        {view.kind === "course" && !current && (
          <p className="text-ink-faint">Course not found.</p>
        )}

        {view.kind === "settings" && (
          <Settings
            data={data}
            onImportData={(d) => {
              setData(d);
              setView({ kind: "dashboard" });
            }}
          />
        )}
      </main>

      {importing && (
        <ImportReview
          onCancel={() => setImporting(false)}
          onSave={(course) => {
            commit(course);
            setImporting(false);
            setView({ kind: "course", id: course.id });
          }}
        />
      )}

      <footer className="border-t border-line/70 py-6 text-center text-xs text-ink-faint">
        Marks live only in this browser · back up from Settings
      </footer>
    </div>
  );
}

function Header({
  onHome,
  onSettings,
  active,
}: {
  onHome: () => void;
  onSettings: () => void;
  active: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <button onClick={onHome} className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">Tally</span>
          <span className="hidden rounded-full bg-accent-wash px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent sm:inline">
            grades
          </span>
        </button>
        <button
          onClick={onSettings}
          className={`btn-ghost ${active === "settings" ? "bg-paper-sunk" : ""}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>
      </div>
    </header>
  );
}
