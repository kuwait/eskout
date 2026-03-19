// src/components/players/ScoutingReports.tsx
// Displays extracted scouting reports as Eskout-formatted cards with detail dialog
// Replaces raw PDF links with structured report data from the scouting_reports table
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useState } from 'react';
import { ChevronDown, FileText, ExternalLink, Trash2, Phone } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { ScoutingReport } from '@/lib/types';

/* ───────────── Rating Colors ───────────── */

/* Unified 1-5 color scale: 1=red, 2=yellow, 3=blue, 4=dark green, 5=green */
const RATING_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  2: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  3: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  4: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  5: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
};
const RATING_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-500', border: 'border-neutral-200' };

const RATING_DOT_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-sky-500',
  4: 'bg-teal-500',
  5: 'bg-green-500',
};

/** Decision color mapping */
const DECISION_STYLES: Record<string, { bg: string; text: string }> = {
  'Assinar': { bg: 'bg-green-100', text: 'text-green-700' },
  'Acompanhar': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  'Rever': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Sem interesse': { bg: 'bg-red-100', text: 'text-red-700' },
  'Sem Interesse': { bg: 'bg-red-100', text: 'text-red-700' },
};
const DECISION_DEFAULT = { bg: 'bg-neutral-100', text: 'text-neutral-600' };

/* ───────────── Expandable Report Card ───────────── */

function ReportCard({ report, canDelete, onDelete }: { report: ScoutingReport; canDelete?: boolean; onDelete?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const ratingKey = Math.ceil(report.rating ?? 0) || 1;
  const rc = RATING_COLORS[ratingKey] ?? RATING_DEFAULT;
  const dc = report.decision ? (DECISION_STYLES[report.decision] ?? DECISION_DEFAULT) : null;
  const dotColor = RATING_DOT_COLORS[ratingKey] ?? 'bg-neutral-300';
  const hasContent = report.physicalProfile || report.strengths || report.weaknesses || report.analysis;

  return (
    <div className={`rounded-lg border ${rc.border} overflow-hidden`}>
      {/* Header — colored background, click to expand */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all ${rc.bg} hover:shadow-sm`}
      >
        {/* Rating circle */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dotColor}`}>
          {report.rating != null ? (Number.isInteger(report.rating) ? report.rating : report.rating.toFixed(1)) : '?'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-neutral-900">
              {report.match || report.teamReport || report.pdfFilename || `Relatório ${report.reportNumber}`}
            </p>
            {dc && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${dc.bg} ${dc.text}`}>
                {report.decision}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {report.matchDate && <span>{formatDate(report.matchDate)}</span>}
            {report.competition && <span>{report.competition}</span>}
            {report.scoutName && <span>{report.scoutName}</span>}
          </div>
        </div>

        {hasContent && (
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Expanded details */}
      {expanded && hasContent && (
        <div className="border-t bg-white px-4 pt-4 pb-3 flex flex-col gap-3">
          {/* Match result — centered scoreboard */}
          {report.matchResult && (() => {
            const parts = report.matchResult.split('-').map(s => s.trim());
            const teams = report.match ? report.match.split(/\s+vs\s+/i) : [];
            return (
              <div className="flex items-center justify-center gap-4 rounded-lg bg-neutral-50 py-3 px-4">
                <span className="flex-1 truncate text-right text-xs font-medium text-neutral-600">{teams[0] || ''}</span>
                <span className="text-lg font-black tabular-nums text-neutral-900">{parts[0] ?? '?'} <span className="text-neutral-300 font-normal">:</span> {parts[1] ?? '?'}</span>
                <span className="flex-1 truncate text-left text-xs font-medium text-neutral-600">{teams[1] || ''}</span>
              </div>
            );
          })()}

          {/* Strengths & Weaknesses — side by side on desktop, stacked on mobile */}
          {(report.strengths || report.weaknesses) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {report.strengths && (
                <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/30 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Pontos Fortes</p>
                  <p className="text-[13px] whitespace-pre-line text-neutral-700 leading-relaxed">{report.strengths}</p>
                </div>
              )}
              {report.weaknesses && (
                <div className="rounded-lg border border-rose-200/60 bg-rose-50/30 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1">Pontos Fracos</p>
                  <p className="text-[13px] whitespace-pre-line text-neutral-700 leading-relaxed">{report.weaknesses}</p>
                </div>
              )}
            </div>
          )}

          {/* Physical profile */}
          {report.physicalProfile && (
            <div className="rounded-lg border border-sky-200/60 bg-sky-50/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-500 mb-1">Perfil Físico</p>
              <p className="text-[13px] whitespace-pre-line text-neutral-700 leading-relaxed">{report.physicalProfile}</p>
            </div>
          )}

          {/* Analysis */}
          {report.analysis && (
            <div className="rounded-lg border border-violet-200/60 bg-violet-50/30 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500 mb-1">Análise</p>
              <p className="text-[13px] whitespace-pre-line text-neutral-700 leading-relaxed">{report.analysis}</p>
            </div>
          )}

          {/* Footer — contact + PDF + delete, all in one row */}
          {(report.contactInfo || report.gdriveLink || canDelete) && (
            <div className="flex flex-wrap items-center gap-2">
              {report.contactInfo && (
                <a
                  href={`tel:${report.contactInfo.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {report.contactInfo}
                </a>
              )}
              {report.gdriveLink && (
                <a
                  href={report.gdriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Ver PDF
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete?.()}
                  className="ml-auto p-1 text-neutral-300 hover:text-red-400 transition-colors"
                  aria-label="Eliminar relatório"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Main Component ───────────── */

interface ScoutingReportsProps {
  reports: ScoutingReport[];
  /** Fallback: old-style report labels + links (shown when no extracted reports exist) */
  reportLabels?: string[];
  reportLinks?: string[];
  /** Optional action element rendered next to the title */
  action?: React.ReactNode;
  /** Current user ID — for delete permission */
  currentUserId?: string | null;
  /** Current user role — admin can delete any */
  userRole?: string;
  /** Callback after delete */
  onDelete?: () => void;
}

export function ScoutingReports({ reports, reportLabels = [], reportLinks = [], action, currentUserId, userRole, onDelete }: ScoutingReportsProps) {
  const [deleteTarget, setDeleteTarget] = useState<ScoutingReport | null>(null);

  // Filter to successfully extracted reports
  const extractedReports = reports.filter((r) => r.extractionStatus === 'success' || r.extractionStatus === 'partial');

  // If no extracted reports, fall back to old-style links
  if (extractedReports.length === 0 && reportLabels.length === 0) return null;

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Relatórios de Observação ({extractedReports.length || reportLabels.length})
          </p>
          {action}
        </div>

        {extractedReports.length > 0 ? (
          <div className="space-y-1.5">
            {extractedReports.map((report) => {
              const canDelete = !!(currentUserId && (
                report.authorId === currentUserId || userRole === 'admin'
              ));
              return (
                <ReportCard
                  key={report.id}
                  report={report}
                  canDelete={canDelete}
                  onDelete={() => setDeleteTarget(report)}
                />
              );
            })}
          </div>
        ) : (
          /* Fallback: old-style links */
          <div className="space-y-1.5">
            {reportLabels.map((rawLabel, i) => {
              const label = rawLabel.replace(/\.pdf$/i, '');
              const link = reportLinks[i];
              return (
                <a
                  key={i}
                  href={link || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-md border-l-[3px] border-l-neutral-300 bg-neutral-50/60 px-3 py-2 transition-colors hover:border-l-blue-400 hover:bg-blue-50/40"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500 group-hover:bg-blue-100 group-hover:text-blue-600">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Relatório de observação {link ? '· PDF' : ''}
                    </p>
                  </div>
                  {link && (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100" />
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              Este relatório será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                const { deleteScoutingReport } = await import('@/actions/scout-reports');
                const result = await deleteScoutingReport(deleteTarget.id);
                setDeleteTarget(null);
                if (result.success) {
                  toast.success('Relatório eliminado');
                  onDelete?.();
                } else {
                  toast.error(result.error ?? 'Erro ao eliminar');
                }
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ───────────── Helpers ───────────── */

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}
