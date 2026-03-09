// src/app/admin/relatorios/page.tsx
// Admin reports list — KPIs, highlights, search, filters, paginated list with slide-over
// Analytics (scouts, consensus) are separate sub-routes accessed via tab nav
// RELEVANT FILES: src/actions/scout-reports.ts, src/components/reports/ReportsView.tsx, src/app/admin/relatorios/layout.tsx

import {
  listReportsPaginated,
  getReportKpis,
  getReportHighlights,
  getDistinctScoutNames,
} from '@/actions/scout-reports';
import { ReportKpiCards } from '@/components/reports/ReportKpiCards';
import { ReportHighlights } from '@/components/reports/ReportHighlights';
import { ReportsView } from '@/components/reports/ReportsView';

/* ───────────── Page ───────────── */

const PER_PAGE = 50;

export default async function AdminRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  // Parse filter params
  const search = params.search ?? undefined;
  const status = params.status ?? undefined;
  const decision = params.decision ?? undefined;
  const ratingMin = params.ratingMin ? parseInt(params.ratingMin, 10) : undefined;
  const position = params.position ?? undefined;
  const scoutName = params.scoutName ?? undefined;
  const tag = params.tag ?? undefined;
  const sort = (params.sort as 'date' | 'rating' | 'name') ?? 'date';
  const order = (params.order as 'asc' | 'desc') ?? 'desc';

  // Parallel fetches
  const [reportsResult, kpis, highlights, scoutNames] = await Promise.all([
    listReportsPaginated({ page, perPage: PER_PAGE, search, status, decision, ratingMin, position, scoutName, sort, order, tag }),
    getReportKpis(),
    getReportHighlights(),
    getDistinctScoutNames(),
  ]);

  const { reports, totalCount } = reportsResult;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  return (
    <>
      {/* KPI Cards */}
      <div className="mb-4">
        <ReportKpiCards kpis={kpis} />
      </div>

      {/* Auto Highlights */}
      <div className="mb-4">
        <ReportHighlights highlights={highlights} />
      </div>

      {/* Main report list with search, filters, pagination */}
      <ReportsView
        reports={reports}
        totalCount={totalCount}
        currentPage={page}
        totalPages={totalPages}
        scoutNames={scoutNames}
      />
    </>
  );
}
