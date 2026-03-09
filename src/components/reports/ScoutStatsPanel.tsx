// src/components/reports/ScoutStatsPanel.tsx
// Per-scout analytics table — report count, avg rating, inline SVG sparkline
// Shows 6-month trend as mini chart. No chart library needed.
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/page.tsx

import { Star, TrendingUp } from 'lucide-react';

interface ScoutStat {
  scoutName: string;
  reportCount: number;
  avgRating: number | null;
  monthlyTrend: number[];
}

export function ScoutStatsPanel({ scouts }: { scouts: ScoutStat[] }) {
  if (scouts.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">
        Sem dados de scouts.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <TrendingUp className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold">Atividade por Scout</h3>
      </div>

      <div className="divide-y">
        {scouts.map((scout) => (
          <div key={scout.scoutName} className="flex items-center gap-3 px-4 py-3">
            {/* Name + count */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{scout.scoutName}</p>
              <p className="text-xs text-muted-foreground">
                {scout.reportCount} relatório{scout.reportCount !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Sparkline — 6 months */}
            <div className="shrink-0">
              <Sparkline data={scout.monthlyTrend} />
            </div>

            {/* Avg rating */}
            <div className="flex shrink-0 items-center gap-1">
              {scout.avgRating != null ? (
                <>
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-semibold">{scout.avgRating}</span>
                </>
              ) : (
                <span className="text-xs text-neutral-300">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Inline SVG Sparkline ───────────── */

function Sparkline({ data }: { data: number[] }) {
  const width = 80;
  const height = 24;
  const max = Math.max(...data, 1);

  // Generate polyline points
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  // Area fill polygon — same points + bottom corners
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  const hasActivity = data.some((v) => v > 0);

  if (!hasActivity) {
    return (
      <svg width={width} height={height} className="text-neutral-200">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeWidth={1} strokeDasharray="3,3" />
      </svg>
    );
  }

  return (
    <svg width={width} height={height}>
      <polygon points={areaPoints} fill="rgb(209 250 229)" />
      <polyline
        points={points}
        fill="none"
        stroke="rgb(16 185 129)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
