// src/components/reports/ReportPagination.tsx
// Server-side pagination controls — prev/next + page number buttons
// URL-driven for shareability and SSR compatibility
// RELEVANT FILES: src/components/reports/ReportsView.tsx, src/app/admin/relatorios/page.tsx

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ReportPagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`?${params.toString()}`);
  }

  // Build visible page numbers — show at most 5 centered around current
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {start > 1 && (
        <>
          <PageButton page={1} current={currentPage} onClick={goToPage} />
          {start > 2 && <span className="px-1 text-xs text-neutral-400">...</span>}
        </>
      )}

      {pages.map((p) => (
        <PageButton key={p} page={p} current={currentPage} onClick={goToPage} />
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-xs text-neutral-400">...</span>}
          <PageButton page={totalPages} current={currentPage} onClick={goToPage} />
        </>
      )}

      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function PageButton({ page, current, onClick }: { page: number; current: number; onClick: (p: number) => void }) {
  const isActive = page === current;
  return (
    <button
      onClick={() => onClick(page)}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-neutral-900 text-white'
          : 'text-neutral-600 hover:bg-neutral-100'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {page}
    </button>
  );
}
