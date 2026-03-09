// src/components/reports/ReportDetailPanel.tsx
// Slide-over panel showing full report details — mirrors ReportDialog from player profile
// Opens from the report list without navigating away. "Ver jogador" button links to profile.
// RELEVANT FILES: src/components/reports/ReportsView.tsx, src/actions/scout-reports.ts, src/components/players/ScoutingReports.tsx

'use client';

import Link from 'next/link';
import { FileText, ExternalLink, User } from 'lucide-react';
import {
  Sheet, SheetContent, SheetFooter, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { ScoutReportRow } from '@/actions/scout-reports';

/* ───────────── Rating Colors (matches ScoutingReports.tsx) ───────────── */

const RATING_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  2: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  3: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  4: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  5: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
};
const RATING_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-500', border: 'border-neutral-200' };

const RATING_DOT_COLORS: Record<number, string> = {
  1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-blue-400', 4: 'bg-emerald-400', 5: 'bg-emerald-600',
};

const DECISION_STYLES: Record<string, { bg: string; text: string }> = {
  'Assinar': { bg: 'bg-green-100', text: 'text-green-700' },
  'Acompanhar': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  'Rever': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Sem interesse': { bg: 'bg-red-100', text: 'text-red-700' },
  'Sem Interesse': { bg: 'bg-red-100', text: 'text-red-700' },
};
const DECISION_DEFAULT = { bg: 'bg-neutral-100', text: 'text-neutral-600' };

/* ───────────── Component ───────────── */

export function ReportDetailPanel({
  report,
  open,
  onOpenChange,
}: {
  report: ScoutReportRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!report) return null;

  const rc = report.rating ? (RATING_COLORS[report.rating] ?? RATING_DEFAULT) : RATING_DEFAULT;
  const dc = report.decision ? (DECISION_STYLES[report.decision] ?? DECISION_DEFAULT) : null;
  const dotColor = report.rating ? (RATING_DOT_COLORS[report.rating] ?? 'bg-neutral-300') : 'bg-neutral-300';

  const hasPlayerData = report.playerClub || report.position || report.shirtNumber || report.foot || report.birthYear;
  const hasMatchData = report.competition || report.match || report.matchDate;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
      >
        {/* ───────────── Header — rating hero (matches ReportDialog) ───────────── */}
        <SheetTitle className="sr-only">{report.playerName}</SheetTitle>
        <div className={`shrink-0 ${rc.bg} border-b ${rc.border}`}>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white shadow-md ${dotColor}`}>
              {report.rating ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-neutral-900">{report.playerName}</p>
              <div className="flex items-center gap-2">
                {report.rating && (
                  <span className={`text-sm font-bold ${rc.text}`}>{report.rating}/5</span>
                )}
                {dc && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${dc.bg} ${dc.text}`}>
                    {report.decision}
                  </span>
                )}
              </div>
              {report.authorName && (
                <p className="mt-0.5 text-xs text-muted-foreground">por {report.authorName}</p>
              )}
            </div>
          </div>
        </div>

        {/* ───────────── Body ───────────── */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* Match context — compact row */}
          {hasMatchData && (
            <div className="space-y-1.5 text-sm">
              {report.match && (
                <p className="font-semibold text-neutral-900">{report.match}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {report.competition && <span>{report.competition}</span>}
                {report.competition && (report.matchDate || report.matchResult) && <span>·</span>}
                {report.matchDate && <span>{formatDate(report.matchDate)}</span>}
                {report.matchDate && report.matchResult && <span>·</span>}
                {report.matchResult && <span className="font-medium text-neutral-700">{report.matchResult}</span>}
              </div>
            </div>
          )}

          {/* Player data — compact pills */}
          {hasPlayerData && (
            <div className="flex flex-wrap gap-1.5">
              {report.playerClub && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{report.playerClub}</span>
              )}
              {report.position && (
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">{report.position}</span>
              )}
              {report.shirtNumber && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">#{report.shirtNumber}</span>
              )}
              {report.foot && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">Pé {report.foot}</span>
              )}
              {report.birthYear && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{report.birthYear}</span>
              )}
            </div>
          )}

          {/* Divider */}
          {(hasMatchData || hasPlayerData) && (report.physicalProfile || report.strengths || report.weaknesses) && (
            <hr className="border-neutral-100" />
          )}

          {/* Assessment blocks */}
          {report.physicalProfile && (
            <AssessmentBlock title="Perfil Físico" content={report.physicalProfile} />
          )}
          {report.strengths && (
            <AssessmentBlock title="Pontos Fortes" content={report.strengths} variant="positive" />
          )}
          {report.weaknesses && (
            <AssessmentBlock title="Pontos Fracos" content={report.weaknesses} variant="negative" />
          )}
          {report.analysis && (
            <AssessmentBlock title="Análise" content={report.analysis} />
          )}

          {/* Contact */}
          {report.contactInfo && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Contacto:</span> {report.contactInfo}
            </div>
          )}
        </div>

        {/* ───────────── Footer ───────────── */}
        <SheetFooter className="shrink-0 border-t px-5 py-3">
          <div className="flex w-full items-center gap-2">
            {report.playerId && (
              <Button asChild variant="default" className="flex-1">
                <Link href={`/jogadores/${report.playerId}`}>
                  <User className="mr-2 h-4 w-4" />
                  Ver Jogador
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} className={report.playerId ? '' : 'flex-1'}>
              Fechar
            </Button>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            {report.source === 'pdf' ? 'PDF' : 'Submissão'} · {formatDate(report.createdAt)}
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── Helper Components (matches ScoutingReports.tsx) ───────────── */

function AssessmentBlock({ title, content, variant }: { title: string; content: string; variant?: 'positive' | 'negative' }) {
  const borderColor = variant === 'positive' ? 'border-l-emerald-400' : variant === 'negative' ? 'border-l-red-400' : 'border-l-neutral-300';

  return (
    <div className={`rounded-lg border border-l-[3px] ${borderColor} p-3`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="whitespace-pre-line text-sm text-neutral-700">{content}</p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}
