// src/components/reports/ActivityHeatmap.tsx
// GitHub-style contribution heatmap — 365 days of report activity
// Client component for tooltip interactivity on hover
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/page.tsx

'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';

interface DayData {
  date: string;
  count: number;
}

/* ───────────── Color Scale ───────────── */

const LEVEL_COLORS = [
  'bg-neutral-100',      // 0 reports
  'bg-emerald-200',      // 1
  'bg-emerald-300',      // 2-3
  'bg-emerald-500',      // 4-6
  'bg-emerald-700',      // 7+
];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

const WEEKDAY_LABELS = ['Seg', '', 'Qua', '', 'Sex', '', ''];
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ───────────── Component ───────────── */

export function ActivityHeatmap({ data }: { data: DayData[] }) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  // Build a map from date string to count
  const countMap = new Map<string, number>();
  for (const d of data) countMap.set(d.date, d.count);

  // Generate the last 365 days grid
  const today = new Date();
  const days: { date: string; count: number; dayOfWeek: number }[] = [];

  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      count: countMap.get(dateStr) ?? 0,
      dayOfWeek: (d.getDay() + 6) % 7, // Monday = 0
    });
  }

  // Group into weeks (columns)
  const weeks: typeof days[] = [];
  let currentWeek: typeof days = [];

  // Pad first week with empty slots
  if (days.length > 0) {
    for (let i = 0; i < days[0].dayOfWeek; i++) {
      currentWeek.push({ date: '', count: 0, dayOfWeek: i });
    }
  }

  for (const day of days) {
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  // Detect month boundaries for labels
  const monthLabels: { weekIdx: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDay = weeks[w].find((d) => d.date !== '');
    if (firstDay) {
      const month = new Date(firstDay.date).getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ weekIdx: w, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    }
  }

  const totalReports = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">Atividade</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {totalReports} relatório{totalReports !== 1 ? 's' : ''} no último ano
        </span>
      </div>

      {/* Heatmap grid */}
      <div className="relative overflow-x-auto scrollbar-none">
        {/* Month labels */}
        <div className="mb-1 flex" style={{ paddingLeft: 28 }}>
          {monthLabels.map((ml, i) => {
            const nextWeekIdx = monthLabels[i + 1]?.weekIdx ?? weeks.length;
            const span = nextWeekIdx - ml.weekIdx;
            return (
              <div
                key={`${ml.label}-${ml.weekIdx}`}
                className="text-[10px] text-muted-foreground"
                style={{ width: span * 14, flexShrink: 0 }}
              >
                {span >= 3 ? ml.label : ''}
              </div>
            );
          })}
        </div>

        <div className="flex gap-0">
          {/* Weekday labels */}
          <div className="mr-1 flex shrink-0 flex-col gap-[2px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} className="flex h-[12px] items-center text-[9px] text-muted-foreground" style={{ width: 24 }}>
                {label}
              </div>
            ))}
          </div>

          {/* Weeks grid */}
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-[2px]">
              {week.map((day, dIdx) => (
                <div
                  key={dIdx}
                  className={`h-[12px] w-[12px] rounded-[2px] ${
                    day.date === '' ? '' : LEVEL_COLORS[getLevel(day.count)]
                  }`}
                  onMouseEnter={(e) => {
                    if (day.date) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ date: day.date, count: day.count, x: rect.left, y: rect.top });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center justify-end gap-1">
          <span className="mr-1 text-[9px] text-muted-foreground">Menos</span>
          {LEVEL_COLORS.map((color, i) => (
            <div key={i} className={`h-[10px] w-[10px] rounded-[2px] ${color}`} />
          ))}
          <span className="ml-1 text-[9px] text-muted-foreground">Mais</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white shadow-lg"
          style={{ left: tooltip.x - 40, top: tooltip.y - 32 }}
        >
          {tooltip.count} relatório{tooltip.count !== 1 ? 's' : ''} · {new Date(tooltip.date).toLocaleDateString('pt-PT')}
        </div>
      )}
    </div>
  );
}
