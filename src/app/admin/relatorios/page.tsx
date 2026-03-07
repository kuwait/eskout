// src/app/admin/relatorios/page.tsx
// Admin view of all scout-submitted reports with status filter tabs
// Pending reports can be approved (creates player) or rejected
// RELEVANT FILES: src/actions/scout-reports.ts, src/app/admin/relatorios/[id]/page.tsx, src/app/meus-relatorios/page.tsx

import Link from 'next/link';
import { ChevronRight, FileText, Star } from 'lucide-react';
import { listAllScoutReports } from '@/actions/scout-reports';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700' },
  aprovado: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700' },
  rejeitado: { label: 'Rejeitado', className: 'bg-red-100 text-red-700' },
};

const TABS = [
  { value: undefined, label: 'Todos' },
  { value: 'pendente' as const, label: 'Pendentes' },
  { value: 'aprovado' as const, label: 'Aprovados' },
  { value: 'rejeitado' as const, label: 'Rejeitados' },
];

export default async function AdminRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const statusFilter = ['pendente', 'aprovado', 'rejeitado'].includes(statusParam ?? '')
    ? (statusParam as 'pendente' | 'aprovado' | 'rejeitado')
    : undefined;

  const { reports, error } = await listAllScoutReports(statusFilter);

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Relatórios de Scouts</h1>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border bg-neutral-50 p-1">
        {TABS.map((tab) => {
          const isActive = tab.value === statusFilter;
          const href = tab.value ? `?status=${tab.value}` : '/admin/relatorios';
          return (
            <Link
              key={tab.label}
              href={href}
              className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                isActive ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FileText className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm">
            {statusFilter ? `Nenhum relatório ${statusFilter}.` : 'Nenhum relatório submetido.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pendente;
            return (
              <Link
                key={report.id}
                href={`/admin/relatorios/${report.id}`}
                className="block rounded-lg border bg-white p-4 transition-colors hover:bg-neutral-50"
              >
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

                {/* Rating + author */}
                <div className="mt-2 flex items-center justify-between">
                  {report.rating ? (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3.5 w-3.5 ${
                            s <= report.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'
                          }`}
                        />
                      ))}
                    </div>
                  ) : <div />}
                  <div className="text-[11px] text-muted-foreground">
                    {report.authorName && <span>{report.authorName} · </span>}
                    {new Date(report.createdAt).toLocaleDateString('pt-PT')}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
