import type { GradeBand, TermGroup } from "../lib/transcript";
import { gradeColor } from "../lib/format";

// Two small performance charts. Both reuse the app's grade-color ramp (red→green
// by magnitude) and label every mark with its number, so meaning never rests on
// colour alone. Single-series — the card title names the measure, so no legend.

/** Line of cumulative average per term, in chronological order. */
export function TermTrend({ groups }: { groups: TermGroup[] }) {
  const points = groups
    .filter((g) => g.average != null)
    .map((g) => ({ term: g.term || "—", avg: g.average as number }));
  if (points.length === 0) return null;

  const H = 150;
  const padX = 34;
  const padTop = 26;
  const padBottom = 34;
  const W = Math.max(300, points.length * 84);
  const lo = Math.min(50, Math.floor(Math.min(...points.map((p) => p.avg)) / 10) * 10);
  const hi = 100;

  const x = (i: number) =>
    points.length === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (points.length - 1);
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (H - padTop - padBottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="block">
        <line x1={padX / 2} y1={y(lo)} x2={W - padX / 2} y2={y(lo)} stroke="#e7e1d6" strokeWidth={1} />
        {points.length > 1 && <path d={line} fill="none" stroke="#b4541f" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((p, i) => (
          <g key={p.term}>
            <circle cx={x(i)} cy={y(p.avg)} r={5} fill={gradeColor(p.avg)} stroke="#fff" strokeWidth={2}>
              <title>{`${p.term}: ${Math.round(p.avg)}%`}</title>
            </circle>
            <text x={x(i)} y={y(p.avg) - 11} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
              {Math.round(p.avg)}
            </text>
            <text x={x(i)} y={H - 12} textAnchor="middle" className="fill-ink-faint text-[10px]">
              {p.term}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Histogram of graded courses across the six percentage bands. */
export function Distribution({ bands }: { bands: GradeBand[] }) {
  const max = Math.max(1, ...bands.map((b) => b.count));
  const total = bands.reduce((s, b) => s + b.count, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-end gap-2">
      {bands.map((b) => {
        const mid = (b.lo + Math.min(b.hi, 100)) / 2;
        const pctH = b.count === 0 ? 0 : Math.max((b.count / max) * 100, 6);
        return (
          <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center">
            <span className="mb-1 text-[11px] font-semibold tabular-nums text-ink-soft">{b.count}</span>
            <div className="flex h-[104px] w-full items-end">
              <div
                className="mx-auto w-full max-w-[40px] rounded-t"
                style={{ height: `${pctH}%`, background: gradeColor(mid) }}
                title={`${b.label}: ${b.count}`}
              />
            </div>
            <span className="mt-1 text-[10px] text-ink-faint">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
