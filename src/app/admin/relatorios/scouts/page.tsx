// src/app/admin/relatorios/scouts/page.tsx
// Scout analytics page — per-scout stats with sparklines + activity heatmap
// Accessed via tab nav from /admin/relatorios
// RELEVANT FILES: src/actions/scout-reports.ts, src/components/reports/ScoutStatsPanel.tsx, src/components/reports/ActivityHeatmap.tsx

import { getScoutStats, getActivityHeatmap } from '@/actions/scout-reports';
import { ScoutStatsPanel } from '@/components/reports/ScoutStatsPanel';
import { ActivityHeatmap } from '@/components/reports/ActivityHeatmap';

export default async function ScoutsPage() {
  const [{ scouts }, heatmapData] = await Promise.all([
    getScoutStats(),
    getActivityHeatmap(),
  ]);

  return (
    <div className="space-y-6">
      <ActivityHeatmap data={heatmapData} />
      <ScoutStatsPanel scouts={scouts} />
    </div>
  );
}
