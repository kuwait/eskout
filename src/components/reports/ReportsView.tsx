// src/components/reports/ReportsView.tsx
// Main client orchestrator for admin reports page — search, filters, report list, pagination, slide-over
// Manages search debounce with URL push, filter state via searchParams, and slide-over panel
// RELEVANT FILES: src/app/admin/relatorios/page.tsx, src/actions/scout-reports.ts, src/components/reports/ReportDetailPanel.tsx

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import Link from 'next/link';
import { Search, Star, FileText } from 'lucide-react';
import { ReportFilters } from './ReportFilters';
import { ReportPagination } from './ReportPagination';
import { ReportDetailPanel } from './ReportDetailPanel';
import { ReportTagButtons } from './ReportTagButton';
import type { ScoutReportRow } from '@/actions/scout-reports';

/* ───────────── Constants ───────────── */

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Mais recentes' },
  { value: 'date-asc', label: 'Mais antigos' },
  { value: 'rating-desc', label: 'Maior rating' },
  { value: 'rating-asc', label: 'Menor rating' },
  { value: 'name-asc', label: 'Nome A-Z' },
  { value: 'name-desc', label: 'Nome Z-A' },
];

const DECISION_COLORS: Record<string, string> = {
  'Assinar': 'bg-emerald-100 text-emerald-700',
  'Acompanhar': 'bg-yellow-100 text-yellow-700',
  'Sem interesse': 'bg-red-100 text-red-700',
  'Rever': 'bg-blue-100 text-blue-700',
};

/* ───────────── Component ───────────── */

export function ReportsView({
  reports,
  totalCount,
  currentPage,
  totalPages,
  scoutNames,
}: {
  reports: ScoutReportRow[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  scoutNames: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedReport, setSelectedReport] = useState<ScoutReportRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  /* ───────────── Realtime: refresh when reports change ───────────── */
  useRealtimeTable('scouting_reports', { onAny: () => router.refresh() });

  // Debounced search
  const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync search input with URL on external navigation
  /* eslint-disable react-hooks/set-state-in-effect -- syncs local input state with URL search params */
  useEffect(() => {
    const urlSearch = searchParams.get('search') ?? '';
    setSearchValue(urlSearch);
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSearch = useCallback((value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set('search', value.trim());
      } else {
        params.delete('search');
      }
      params.delete('page');
      router.push(`?${params.toString()}`);
    }, 300);
  }, [searchParams, router]);

  // Sort handler
  const currentSort = searchParams.get('sort') ?? 'date';
  const currentOrder = searchParams.get('order') ?? 'desc';
  const sortKey = `${currentSort}-${currentOrder}`;

  function handleSort(value: string) {
    const [sort, order] = value.split('-');
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sort);
    params.set('order', order);
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function openPanel(report: ScoutReportRow) {
    setSelectedReport(report);
    setPanelOpen(true);
  }

  return (
    <>
      {/* Search + Sort row */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Pesquisar jogador ou clube..."
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-neutral-400"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => handleSort(e.target.value)}
          className="rounded-lg border bg-white px-3 py-2 text-sm text-neutral-600"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <ReportFilters scoutNames={scoutNames} />
      </div>

      {/* Count */}
      <p className="mb-3 text-xs text-muted-foreground">
        {totalCount} relatório{totalCount !== 1 ? 's' : ''}
        {currentPage > 1 && ` · Página ${currentPage}`}
      </p>

      {/* Report list */}
      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FileText className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm">Nenhum relatório encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onClick={() => openPanel(report)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4">
        <ReportPagination currentPage={currentPage} totalPages={totalPages} />
      </div>

      {/* Slide-over panel */}
      <ReportDetailPanel
        report={selectedReport}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </>
  );
}

/* ───────────── Report Row ───────────── */

function ReportRow({ report, onClick }: { report: ScoutReportRow; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-colors hover:bg-neutral-50"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{report.playerName}</p>
          {report.source === 'pdf' && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-neutral-400">PDF</span>
          )}
          {report.decision && (
            <span className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold sm:inline ${DECISION_COLORS[report.decision] ?? 'bg-neutral-100 text-neutral-600'}`}>
              {report.decision}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {report.playerClub && <span className="truncate">{report.playerClub}</span>}
          {report.position && <span>· {report.position}</span>}
          {report.authorName && <span className="hidden sm:inline">· {report.authorName}</span>}
          <span>· {new Date(report.createdAt).toLocaleDateString('pt-PT')}</span>
        </div>
      </div>

      {/* Rating */}
      <div className="hidden shrink-0 sm:flex">
        {report.rating ? (
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`h-3 w-3 ${
                  s <= report.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'
                }`}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs text-neutral-300">—</span>
        )}
      </div>

      {/* Tag buttons */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <ReportTagButtons reportId={report.id} tags={report.adminTags} />
      </div>
    </div>
  );
}
