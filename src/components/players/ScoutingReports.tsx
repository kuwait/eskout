// src/components/players/ScoutingReports.tsx
// Displays extracted scouting reports as Eskout-formatted cards with detail dialog
// Replaces raw PDF links with structured report data from the scouting_reports table
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useState } from 'react';
import { FileText, X, ExternalLink } from 'lucide-react';
import type { ScoutingReport } from '@/lib/types';

/* ───────────── Rating Colors ───────────── */

const RATING_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  2: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  3: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  4: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  5: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
};
const RATING_DEFAULT = { bg: 'bg-neutral-50', text: 'text-neutral-500', border: 'border-neutral-200' };

const RATING_DOT_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-blue-400',
  4: 'bg-emerald-400',
  5: 'bg-emerald-600',
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

/* ───────────── Report Card (compact, in list) ───────────── */

function ReportCard({ report, onClick }: { report: ScoutingReport; onClick: () => void }) {
  const rc = report.rating ? (RATING_COLORS[report.rating] ?? RATING_DEFAULT) : RATING_DEFAULT;
  const dc = report.decision ? (DECISION_STYLES[report.decision] ?? DECISION_DEFAULT) : null;
  const dotColor = report.rating ? (RATING_DOT_COLORS[report.rating] ?? 'bg-neutral-300') : 'bg-neutral-300';

  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-3 rounded-lg border ${rc.border} ${rc.bg} px-3 py-2.5 text-left transition-all hover:shadow-sm hover:ring-1 hover:ring-blue-200`}
    >
      {/* Rating circle */}
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${dotColor}`}>
        {report.rating ?? '?'}
      </div>

      {/* Info */}
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
          {report.matchDate && (
            <span>{formatDate(report.matchDate)}</span>
          )}
          {report.competition && (
            <span>{report.competition}</span>
          )}
          {report.scoutName && (
            <span>{report.scoutName}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ───────────── Report Detail Dialog ───────────── */

function ReportDialog({ report, onClose }: { report: ScoutingReport; onClose: () => void }) {
  const rc = report.rating ? (RATING_COLORS[report.rating] ?? RATING_DEFAULT) : RATING_DEFAULT;
  const dc = report.decision ? (DECISION_STYLES[report.decision] ?? DECISION_DEFAULT) : null;
  const dotColor = report.rating ? (RATING_DOT_COLORS[report.rating] ?? 'bg-neutral-300') : 'bg-neutral-300';

  const hasPlayerData = report.playerNameReport || report.teamReport || report.positionReport;
  const hasMatchData = report.competition || report.match || report.matchDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — rating hero + close */}
        <div className={`sticky top-0 z-10 rounded-t-2xl ${rc.bg} border-b ${rc.border}`}>
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-white/80 p-1.5 hover:bg-white">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-4 px-5 py-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white shadow-md ${dotColor}`}>
              {report.rating ?? '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${rc.text}`}>{report.rating}/5</span>
                {dc && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${dc.bg} ${dc.text}`}>
                    {report.decision}
                  </span>
                )}
              </div>
              {report.analysis && (
                <p className="mt-0.5 text-sm text-neutral-600">{report.analysis}</p>
              )}
              {report.scoutName && (
                <p className="mt-0.5 text-xs text-muted-foreground">por {report.scoutName}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* Match context — compact row */}
          {hasMatchData && (
            <div className="space-y-1.5 text-sm">
              {report.match && (
                <p className="font-semibold text-neutral-900">{report.match}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {report.competition && <span>{report.competition}</span>}
                {report.competition && (report.ageGroup || report.matchDate || report.matchResult) && <span>·</span>}
                {report.ageGroup && <span>{report.ageGroup}</span>}
                {report.ageGroup && (report.matchDate || report.matchResult) && <span>·</span>}
                {report.matchDate && <span>{formatDate(report.matchDate)}</span>}
                {report.matchDate && report.matchResult && <span>·</span>}
                {report.matchResult && <span className="font-medium text-neutral-700">{report.matchResult}</span>}
              </div>
            </div>
          )}

          {/* Player data — compact pills */}
          {hasPlayerData && (
            <div className="flex flex-wrap gap-1.5">
              {report.teamReport && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{report.teamReport}</span>
              )}
              {report.positionReport && (
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">{report.positionReport}</span>
              )}
              {report.shirtNumberReport && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">#{report.shirtNumberReport}</span>
              )}
              {report.footReport && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">Pé {report.footReport}</span>
              )}
              {report.birthYearReport && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{report.birthYearReport}</span>
              )}
            </div>
          )}

          {/* Divider */}
          {(hasMatchData || hasPlayerData) && (report.physicalProfile || report.strengths || report.weaknesses) && (
            <hr className="border-neutral-100" />
          )}

          {/* Physical profile */}
          {report.physicalProfile && (
            <AssessmentBlock title="Perfil Físico" content={report.physicalProfile} />
          )}

          {/* Strengths */}
          {report.strengths && (
            <AssessmentBlock title="Pontos Fortes" content={report.strengths} variant="positive" />
          )}

          {/* Weaknesses */}
          {report.weaknesses && (
            <AssessmentBlock title="Pontos Fracos" content={report.weaknesses} variant="negative" />
          )}

          {/* Contact */}
          {report.contactInfo && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Contacto:</span> {report.contactInfo}
            </div>
          )}

          {/* Footer — PDF link */}
          {report.gdriveLink && (
            <div className="border-t pt-3">
              <a
                href={report.gdriveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                Ver PDF original
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Helper Components ───────────── */

function AssessmentBlock({ title, content, variant }: { title: string; content: string; variant?: 'positive' | 'negative' }) {
  const borderColor = variant === 'positive' ? 'border-l-emerald-400' : variant === 'negative' ? 'border-l-red-400' : 'border-l-neutral-300';

  return (
    <div className={`rounded-lg border border-l-[3px] ${borderColor} p-3`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="whitespace-pre-line text-sm text-neutral-700">{content}</p>
    </div>
  );
}

/* ───────────── Main Component ───────────── */

interface ScoutingReportsProps {
  reports: ScoutingReport[];
  /** Fallback: old-style report labels + links (shown when no extracted reports exist) */
  reportLabels?: string[];
  reportLinks?: string[];
}

export function ScoutingReports({ reports, reportLabels = [], reportLinks = [] }: ScoutingReportsProps) {
  const [selectedReport, setSelectedReport] = useState<ScoutingReport | null>(null);

  // Filter to successfully extracted reports
  const extractedReports = reports.filter((r) => r.extractionStatus === 'success' || r.extractionStatus === 'partial');

  // If no extracted reports, fall back to old-style links
  if (extractedReports.length === 0 && reportLabels.length === 0) return null;

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Relatórios ({extractedReports.length || reportLabels.length})
        </p>

        {extractedReports.length > 0 ? (
          <div className="space-y-1.5">
            {extractedReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onClick={() => setSelectedReport(report)}
              />
            ))}
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

      {/* Report detail dialog */}
      {selectedReport && (
        <ReportDialog report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
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
