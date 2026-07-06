import { useMemo } from "react";
import type { Course } from "../types";
import { gradeSummary } from "../lib/grades";
import { pct } from "../lib/format";
import { GradeRing } from "./GradeRing";

interface Props {
  courses: Course[];
  onOpen: (id: string) => void;
  onImport: () => void;
  onNewBlank: () => void;
}

export function Dashboard({ courses, onOpen, onImport, onNewBlank }: Props) {
  const actions = (
    <div className="flex shrink-0 gap-2">
      <button onClick={onNewBlank} className="btn-ghost">
        Add manually
      </button>
      <button onClick={onImport} className="btn-accent">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Upload outline
      </button>
    </div>
  );

  if (courses.length === 0) {
    return (
      <div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label text-accent">Your term at a glance</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Grades, kept honest.
            </h1>
            <p className="mt-2 max-w-lg text-ink-soft">
              Drop in a course outline and Tally builds the grading scheme for you. Enter marks as
              they land; watch where you stand and what it takes to land your target.
            </p>
          </div>
          {actions}
        </div>
        <EmptyState onImport={onImport} onNewBlank={onNewBlank} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label text-accent">Term overview</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
            Where you stand
          </h1>
        </div>
        {actions}
      </div>

      <TermSummary courses={courses} />

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </div>
  );
}

function TermSummary({ courses }: { courses: Course[] }) {
  const stats = useMemo(() => {
    let projSum = 0;
    let projW = 0;
    let gradedSum = 0;
    let gradedW = 0;
    let onTarget = 0;
    let withTarget = 0;
    for (const c of courses) {
      const s = gradeSummary(c);
      const w = c.credits != null ? c.credits : 1;
      if (s.projected !== null && s.anyGraded) {
        projSum += s.projected * w;
        projW += w;
      }
      gradedSum += s.weightCompleted * w;
      gradedW += w;
      if (c.targetGrade != null && s.projected != null) {
        withTarget++;
        if (s.projected >= c.targetGrade - 0.05) onTarget++;
      }
    }
    return {
      projected: projW > 0 ? projSum / projW : null,
      graded: gradedW > 0 ? gradedSum / gradedW : 0,
      onTarget,
      withTarget,
      anyCredits: courses.some((c) => c.credits != null),
    };
  }, [courses]);

  return (
    <div className="card mt-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-5">
      <TermStat label="Projected average" value={pct(stats.projected, 1)} accent />
      <TermStat label="Graded so far" value={pct(stats.graded, 0)} />
      {stats.withTarget > 0 && (
        <TermStat
          label="On track"
          value={`${stats.onTarget} of ${stats.withTarget}`}
          good={stats.onTarget === stats.withTarget}
        />
      )}
      <p className="ml-auto max-w-48 text-[11px] leading-snug text-ink-faint">
        {stats.anyCredits
          ? "Averages weighted by course credits."
          : "Averages weight every course equally — set credits on a course to change that."}
      </p>
    </div>
  );
}

function TermStat({
  label,
  value,
  accent,
  good,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <p
        className={`mt-0.5 font-display text-3xl font-semibold tabular-nums ${
          accent ? "text-accent" : good ? "text-good" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CourseCard({ course, onOpen }: { course: Course; onOpen: () => void }) {
  const s = gradeSummary(course);
  const target = course.targetGrade;
  const onTrack = target != null && s.projected != null ? s.projected >= target - 0.05 : null;

  return (
    <button
      onClick={onOpen}
      className="card group flex items-center gap-5 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <GradeRing value={s.current} size={108} stroke={9} track={s.weightCompleted} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {course.code && (
            <span className="rounded bg-paper-sunk px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-soft">
              {course.code}
            </span>
          )}
          {course.term && <span className="text-xs text-ink-faint">{course.term}</span>}
        </div>
        <h3 className="mt-1 truncate font-display text-lg font-semibold leading-snug">
          {course.name}
        </h3>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <Stat label="Projected" value={pct(s.projected, 0)} />
          <Stat label="Graded" value={pct(s.weightCompleted, 0)} />
        </dl>

        {target != null && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                onTrack ? "bg-good/10 text-good" : "bg-bad/10 text-bad"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {onTrack ? "On track" : "Behind"} · target {target}%
            </span>
          </div>
        )}
      </div>
      <svg className="shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="font-display text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ onImport, onNewBlank }: { onImport: () => void; onNewBlank: () => void }) {
  return (
    <div className="card mt-9 flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-wash text-accent">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h4" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold">No courses yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-ink-soft">
          Upload a syllabus or course outline (PDF or HTML) and Tally will pull out the grading
          scheme automatically.
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onImport} className="btn-accent">
          Upload an outline
        </button>
        <button onClick={onNewBlank} className="btn-ghost">
          Or start from scratch
        </button>
      </div>
    </div>
  );
}
