// src/components/players/QuickReportCard.tsx
// Compact card displaying a quick scout report in the player profile timeline
// Shows dimension mini-bars, overall rating, recommendation badge, tags on expand
// RELEVANT FILES: src/components/players/QuickReportForm.tsx, src/lib/types/index.ts

'use client';

import { useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { DIMENSIONS, getTagsForDimension, type Tag } from '@/lib/constants/quick-report-tags';
import type { QuickScoutReport } from '@/lib/types';

/* ───────────── Rating Colors ───────────── */

/* Unified 1-5 color scale: 1=red, 2=yellow, 3=blue, 4=dark green, 5=green */
const BAR_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-sky-500',
  4: 'bg-teal-500',
  5: 'bg-green-500',
};

const CARD_COLORS: Record<number, { bg: string; bgSubtle: string; border: string }> = {
  1: { bg: 'bg-red-50', bgSubtle: 'bg-red-50/30', border: 'border-red-200' },
  2: { bg: 'bg-orange-50', bgSubtle: 'bg-orange-50/30', border: 'border-orange-200' },
  3: { bg: 'bg-sky-50', bgSubtle: 'bg-sky-50/30', border: 'border-sky-200' },
  4: { bg: 'bg-teal-50', bgSubtle: 'bg-teal-50/30', border: 'border-teal-200' },
  5: { bg: 'bg-green-50', bgSubtle: 'bg-green-50/30', border: 'border-green-200' },
};
const CARD_DEFAULT = { bg: 'bg-neutral-50', bgSubtle: 'bg-neutral-50/30', border: 'border-neutral-200' };

const REC_STYLES: Record<string, string> = {
  'Assinar': 'bg-green-100 text-green-800',
  'Acompanhar': 'bg-yellow-100 text-yellow-800',
  'Sem interesse': 'bg-red-100 text-red-800',
};

/* ───────────── Helpers ───────────── */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

/** Determine tag sentiment — checks predefined tags, then custom prefixes (⊕/⊖) */
export function getTagSentiment(tagLabel: string, dimensionKey: string): 'positive' | 'negative' {
  // Custom tags use ⊕/⊖ prefix
  if (tagLabel.startsWith('⊖')) return 'negative';
  if (tagLabel.startsWith('⊕')) return 'positive';
  // Check predefined tags (outfield + GR)
  for (const isGk of [false, true]) {
    const tags = getTagsForDimension(dimensionKey as 'tecnica', isGk);
    const found = tags.find((t: Tag) => t.label === tagLabel);
    if (found) return found.sentiment;
  }
  return 'positive';
}

/** Strip sentiment prefix from custom tags for display */
export function displayTag(tagLabel: string): string {
  return tagLabel.replace(/^[⊕⊖]\s*/, '');
}

/* ───────────── Component ───────────── */

export function QuickReportCard({
  report,
  canDelete = false,
  onDelete,
}: {
  report: QuickScoutReport;
  canDelete?: boolean;
  onDelete?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const ratings: { key: string; label: string; value: number }[] = DIMENSIONS.map(d => ({
    key: d.key,
    label: d.label,
    value: report[`rating${d.key.charAt(0).toUpperCase()}${d.key.slice(1)}` as keyof QuickScoutReport] as number,
  }));

  const allTags = DIMENSIONS.flatMap(d => {
    const tags = report[`tags${d.key.charAt(0).toUpperCase()}${d.key.slice(1)}` as keyof QuickScoutReport] as string[];
    return tags.map(t => ({ dimension: d.label, dimensionKey: d.key, tag: t }));
  });

  async function handleDelete() {
    if (!onDelete) return;
    const { deleteQuickReport } = await import('@/actions/quick-scout-reports');
    const result = await deleteQuickReport(report.id);
    if (result.success) {
      toast.success('Avaliação eliminada');
      onDelete(report.id);
    } else {
      toast.error(result.error ?? 'Erro');
    }
  }

  const ratingKey = Math.ceil(report.ratingOverall) || 1;
  const rc = CARD_COLORS[ratingKey] ?? CARD_DEFAULT;
  const dotColor = BAR_COLORS[ratingKey] ?? 'bg-neutral-400';

  return (
    <div className={`rounded-lg border ${rc.border} overflow-hidden`}>
      {/* Header — colored background like PDF report cards */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all ${rc.bg} hover:shadow-sm`}
      >
        {/* Overall rating circle */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dotColor}`}>
          {Number.isInteger(report.ratingOverall) ? report.ratingOverall : report.ratingOverall.toFixed(1)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-neutral-900">
              {report.opponent || report.competition || report.authorName}
            </p>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${REC_STYLES[report.recommendation] ?? ''}`}>
              {report.recommendation}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{formatDate(report.createdAt)}</span>
            {report.competition && report.opponent && <span>{report.competition}</span>}
            <span>{report.authorName}</span>
            {report.observedPosition && <span className="font-medium">{report.observedPosition}</span>}
          </div>
        </div>

        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className={`relative border-t px-4 pt-4 pb-0 flex flex-col gap-4 ${rc.bgSubtle}`}>
          {/* Delete icon — top right corner */}
          {canDelete && (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-400 transition-colors"
              aria-label="Eliminar avaliação"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Dimension details */}
          <div className="space-y-4 pl-2">
            {ratings.map(r => {
              const dimTags = allTags.filter(t => t.dimension === r.label);
              const dim = DIMENSIONS.find(d => d.key === r.key);
              return (
                <div key={r.key}>
                  {/* Dimension label + score */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">{dim?.emoji}</span>
                    <span className={`text-xs font-semibold ${dim?.textColor ?? ''}`}>{r.label}</span>
                    <span className={`text-sm font-black ${dim?.textColor ?? ''}`}>{r.value}</span>
                  </div>
                  {/* Segmented bar */}
                  <div className="flex h-5 w-full gap-0.5 rounded-md overflow-hidden mb-1.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <div
                        key={n}
                        className={`flex-1 ${n <= r.value ? (dim?.color ?? 'bg-neutral-300') : 'bg-neutral-100'}`}
                      />
                    ))}
                  </div>
                  {dimTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dimTags.map(t => {
                        const sentiment = getTagSentiment(t.tag, t.dimensionKey);
                        return (
                          <span
                            key={t.tag}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              sentiment === 'negative'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {displayTag(t.tag)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Observation context badges */}
          {(report.observedPosition || report.maturation || report.observedFoot || report.heightScale || report.buildScale || report.speedScale || report.intensityScale || report.maturationScale || report.standoutLevel || report.opponentLevel || report.starter || report.minutesObserved || (report.conditions && report.conditions.length > 0)) && (
            <div className="flex flex-wrap gap-1.5 pl-2">
              {report.observedPosition && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  Posição: <span className="font-semibold">{report.observedPosition}</span>
                </span>
              )}
              {report.maturation && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  📏 <span className="font-semibold">{report.maturation}</span>
                </span>
              )}
              {report.observedFoot && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  🦶 <span className="font-semibold">{report.observedFoot}</span>
                </span>
              )}
              {(report.heightScale || report.buildScale || report.speedScale || report.intensityScale) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  ⚡ <span className="font-semibold">{[report.heightScale, report.buildScale, report.speedScale, report.intensityScale].filter(Boolean).join(' · ')}</span>
                </span>
              )}
              {report.maturationScale && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  📏 <span className="font-semibold">{report.maturationScale}</span>
                </span>
              )}
              {report.opponentLevel && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  report.opponentLevel === 'Forte' ? 'border-red-200 bg-red-50 text-red-700'
                    : report.opponentLevel === 'Fraco' ? 'border-neutral-200 bg-neutral-100 text-neutral-600'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}>
                  🏟️ Adv. {report.opponentLevel}
                </span>
              )}
              {report.standoutLevel && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  report.standoutLevel === 'Acima' ? 'border-green-200 bg-green-50 text-green-700'
                    : report.standoutLevel === 'Abaixo' ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}>
                  ⚡ {report.standoutLevel}
                </span>
              )}
              {report.starter && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  🏃 {report.starter}{report.starter === 'Suplente' && report.subMinute ? ` (${report.subMinute}')` : ''}
                </span>
              )}
              {report.minutesObserved && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  ⏱️ {report.minutesObserved} min
                </span>
              )}
              {report.conditions?.map(c => (
                <span key={c} className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Notes — highlighted as important content */}
          {report.notes && (
            <div className={`rounded-lg ${rc.bg} border ${rc.border} p-3.5`}>
              <p className={`text-xs font-bold mb-1 ${dotColor.replace('bg-', 'text-').replace('-500', '-700').replace('-400', '-600')}`}>Notas</p>
              <p className={`text-sm whitespace-pre-line leading-normal ${dotColor.replace('bg-', 'text-').replace('-500', '-700').replace('-400', '-600')}`}>{report.notes}</p>
            </div>
          )}

          {/* Delete confirmation dialog */}
          {canDelete && (
            <div>
              <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar avaliação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta avaliação de <strong>{report.authorName}</strong> será eliminada permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
