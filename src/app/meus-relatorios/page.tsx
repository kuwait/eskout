// src/app/meus-relatorios/page.tsx
// Scout's personal reports page — shows scout_reports submitted by the current user
// Each report shows status (pendente/aprovado/rejeitado) and key details
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/submeter/page.tsx, src/middleware.ts

import { listMyScoutReports } from '@/actions/scout-reports';
import { ChevronRight, FileText, Star } from 'lucide-react';
import Link from 'next/link';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700' },
  aprovado: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700' },
  rejeitado: { label: 'Rejeitado', className: 'bg-red-100 text-red-700' },
};

export default async function MeusRelatoriosPage() {
  const { reports, error } = await listMyScoutReports();

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Meus Relatórios</h1>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FileText className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm">Ainda não submeteste nenhum relatório.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pendente;
            return (
              <Link key={report.id} href={`/meus-relatorios/${report.id}`} className="block rounded-lg border bg-white p-4 transition-colors hover:bg-neutral-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{report.playerName}</p>
                    <p className="text-sm text-muted-foreground">{report.playerClub}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-neutral-300" />
                  </div>
                </div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {report.position && <span>{report.position}</span>}
                  {report.match && <span>{report.match}</span>}
                  {report.matchDate && (
                    <span>{new Date(report.matchDate).toLocaleDateString('pt-PT')}</span>
                  )}
                  {report.decision && (
                    <span className="font-medium text-neutral-700">{report.decision}</span>
                  )}
                </div>

                {/* Rating */}
                {report.rating && (
                  <div className="mt-2 flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-3.5 w-3.5 ${
                          s <= report.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Strengths/weaknesses preview */}
                {report.strengths && (
                  <p className="mt-2 text-sm leading-snug">
                    <span className="font-medium text-emerald-600">+</span>{' '}
                    {report.strengths.length > 120 ? report.strengths.slice(0, 120) + '...' : report.strengths}
                  </p>
                )}
                {report.weaknesses && (
                  <p className="mt-1 text-sm leading-snug">
                    <span className="font-medium text-red-500">−</span>{' '}
                    {report.weaknesses.length > 120 ? report.weaknesses.slice(0, 120) + '...' : report.weaknesses}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {new Date(report.createdAt).toLocaleDateString('pt-PT')} às{' '}
                  {new Date(report.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
