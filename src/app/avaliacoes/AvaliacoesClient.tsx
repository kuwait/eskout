// src/app/avaliacoes/AvaliacoesClient.tsx
// Client component for QSR evaluations — server-side pagination via URL params
// Scouts see own reports, admin/editor see all with filters (author, recommendation, search)
// RELEVANT FILES: src/app/avaliacoes/page.tsx, src/components/players/QuickReportCard.tsx

'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crosshair, ChevronLeft, ChevronRight } from 'lucide-react';
import { QuickReportCard } from '@/components/players/QuickReportCard';
import type { QuickScoutReport } from '@/lib/types';

/* ───────────── Types ───────────── */

interface AvaliacoesProps {
  reports: QuickScoutReport[];
  total: number;
  isScout: boolean;
  title: string;
  page: number;
  pageSize: number;
}

// Recommendation filter options for admin/editor view

/* ───────────── Component ───────────── */

export function AvaliacoesClient({ reports, total, isScout, title, page, pageSize }: AvaliacoesProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Extract unique authors for filter
  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reports) {
      if (r.authorName && r.authorId) map.set(r.authorId, r.authorName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [reports]);

  function navigatePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/avaliacoes?${params.toString()}`);
  }

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">{title}</h1>

      {total === 0 && reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Crosshair className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm">Sem avaliações.</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-3">
          {/* Filters — admin/editor only */}
          {!isScout && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                defaultValue="all"
                onChange={() => {
                  // TODO: server-side filtering via searchParams
                }}
                className="h-8 rounded-lg border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Todos autores</option>
                {authors.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {total} avaliação{total !== 1 ? 'ões' : ''}
            {totalPages > 1 && <> · Página {page + 1} de {totalPages}</>}
          </p>

          {reports.map((report) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = report as any;
            const photoUrl = r.playerPhotoUrl as string | null;
            const playerName = (r.playerName as string) || `Jogador #${report.playerId}`;
            const playerClub = (r.playerClub as string) || '';
            const playerPosition = (r.playerPosition as string | null);

            return (
              <div key={report.id} className="rounded-xl border bg-card overflow-hidden">
                <Link
                  href={`/jogadores/${report.playerId}`}
                  className="flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  {photoUrl ? (
                    <Image src={photoUrl} alt={playerName} width={44} height={44}
                      className="h-11 w-11 shrink-0 rounded-lg border object-cover" unoptimized />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-neutral-100 text-sm font-bold text-neutral-400">
                      {playerName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{playerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {report.createdAt && new Date(report.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {playerPosition && <> · {playerPosition}</>}
                      {playerClub && <> · {playerClub}</>}
                      {!isScout && <> · {report.authorName}</>}
                    </p>
                  </div>
                  {report.recommendation && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      report.recommendation === 'Assinar' ? 'bg-green-100 text-green-700' :
                      report.recommendation === 'Acompanhar' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {report.recommendation}
                    </span>
                  )}
                  {report.ratingOverall > 0 && (
                    <span className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${
                      report.ratingOverall >= 4 ? 'bg-blue-500' :
                      report.ratingOverall >= 3 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}>
                      {report.ratingOverall}
                    </span>
                  )}
                </Link>
                <div className="px-1 py-1">
                  <QuickReportCard report={report} canDelete={!isScout} />
                </div>
              </div>
            );
          })}

          {/* Server-side pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => navigatePage(page - 1)}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-30 hover:bg-accent"
              >
                <ChevronLeft className="h-3 w-3" /> Anterior
              </button>
              <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
              <button
                onClick={() => navigatePage(page + 1)}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-30 hover:bg-accent"
              >
                Seguinte <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
