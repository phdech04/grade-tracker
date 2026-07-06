import { gradeColor, letterGrade } from "../lib/format";

interface Props {
  value: number | null; // 0..100
  size?: number;
  stroke?: number;
  /** secondary faint arc, e.g. weight completed */
  track?: number | null;
  label?: string;
}

export function GradeRing({ value, size = 132, stroke = 11, track = null, label }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color = gradeColor(value);
  const trackV = track === null ? null : Math.max(0, Math.min(100, track));

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#efe9df" strokeWidth={stroke} />
        {trackV !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#ded6c8"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (trackV / 100) * c}
          />
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.22,1,.36,1), stroke .3s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="font-display font-semibold leading-none tabular-nums"
          style={{ fontSize: size * 0.26, color }}
        >
          {value === null ? "—" : Math.round(value)}
        </span>
        <span className="mt-1 text-xs font-semibold tracking-wide text-ink-faint">
          {label ?? letterGrade(value)}
        </span>
      </div>
    </div>
  );
}
