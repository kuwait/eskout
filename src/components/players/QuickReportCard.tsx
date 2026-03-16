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
import { DIMENSIONS } from '@/lib/constants/quick-report-tags';
import type { QuickScoutReport } from '@/lib/types';

/* ───────────── Rating Colors ───────────── */

const BAR_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-blue-500',
  5: 'bg-green-500',
};

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
    return tags.map(t => ({ dimension: d.label, tag: t }));
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

  return (
    <div className="rounded-lg border bg-white">
      {/* Header — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        {/* Overall rating circle */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${BAR_COLORS[report.ratingOverall] ?? 'bg-neutral-400'}`}>
          {report.ratingOverall}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium">{report.authorName}</span>
            <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${REC_STYLES[report.recommendation] ?? ''}`}>
              {report.recommendation}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDate(report.createdAt)}
            {report.competition && ` · ${report.competition}`}
            {report.opponent && ` vs ${report.opponent}`}
          </p>
        </div>

        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          {/* Dimension details */}
          <div className="space-y-2">
            {ratings.map(r => {
              const dimTags = allTags.filter(t => t.dimension === r.label);
              return (
                <div key={r.key}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium w-24">{r.label}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <div
                          key={n}
                          className={`h-2 w-4 rounded-sm ${n <= r.value ? (BAR_COLORS[r.value] ?? 'bg-neutral-300') : 'bg-neutral-100'}`}
                        />
                      ))}
                    </div>
                    <span className="text-muted-foreground">{r.value}/5</span>
                  </div>
                  {dimTags.length > 0 && (
                    <div className="mt-1 ml-24 flex flex-wrap gap-1">
                      {dimTags.map(t => (
                        <span key={t.tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                          {t.tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Notes */}
          {report.notes && (
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              {report.notes}
            </div>
          )}

          {/* Delete with confirmation */}
          {canDelete && (
            <>
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </button>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
