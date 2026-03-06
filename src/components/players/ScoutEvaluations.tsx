// src/components/players/ScoutEvaluations.tsx
// Scout evaluation widget — interactive stars for current user + aggregated team stars with popup detail
// Scales to any number of evaluations. One evaluation per scout per player, upserted on click.
// RELEVANT FILES: src/actions/evaluations.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useId, useState, useTransition } from 'react';
import { Star, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { upsertScoutEvaluation, deleteScoutEvaluation } from '@/actions/evaluations';
import type { ScoutEvaluation } from '@/lib/types';

/* ───────────── Rating Colors ───────────── */

const RATING_COLORS: Record<number, { star: string; text: string; bg: string; border: string }> = {
  1: { star: 'text-red-500', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  2: { star: 'text-orange-400', text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  3: { star: 'text-blue-400', text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  4: { star: 'text-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  5: { star: 'text-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};
const DEFAULT_COLORS = { star: 'text-neutral-300', text: 'text-neutral-500', bg: 'bg-neutral-50', border: 'border-neutral-200' };

const RATING_LABELS: Record<number, string> = {
  1: 'Fraco',
  2: 'Dúvida',
  3: 'Bom',
  4: 'Muito Bom',
  5: 'Excelente',
};

/* ───────────── Partial Star (for fractional averages) ───────────── */

function PartialStar({ fill, colorClass }: { fill: number; colorClass: string }) {
  const clampedFill = Math.max(0, Math.min(1, fill));
  // Stable unique ID per instance to avoid SVG clipPath collisions (SSR-safe)
  const clipId = useId();

  return (
    <span className="relative inline-block h-5 w-5">
      {/* Empty star (background) */}
      <Star className="absolute inset-0 h-5 w-5 text-neutral-200" fill="none" strokeWidth={1.5} />
      {/* Filled portion using clip */}
      {clampedFill > 0 && (
        <svg className="absolute inset-0 h-5 w-5" viewBox="0 0 24 24">
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={24 * clampedFill} height="24" />
            </clipPath>
          </defs>
          <Star
            className={`h-5 w-5 ${colorClass}`}
            fill="currentColor"
            strokeWidth={1.5}
            stroke="currentColor"
            clipPath={`url(#${clipId})`}
          />
        </svg>
      )}
    </span>
  );
}

/* ───────────── Aggregated Stars Row ───────────── */

function AggregatedStars({ avg, colorClass }: { avg: number; colorClass: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const starNum = i + 1;
        const fill = Math.min(1, Math.max(0, avg - i));
        if (fill >= 1) {
          return <Star key={starNum} className={`h-5 w-5 ${colorClass}`} fill="currentColor" strokeWidth={1.5} />;
        }
        return <PartialStar key={starNum} fill={fill} colorClass={colorClass} />;
      })}
    </div>
  );
}

/* ───────────── Props ───────────── */

interface ScoutEvaluationsProps {
  playerId: number;
  evaluations: ScoutEvaluation[];
  currentUserId: string | null;
  /** Individual ratings extracted from scouting reports (included in global average) */
  reportRatings?: { rating: number; scoutName: string }[];
}

/* ───────────── Component ───────────── */

export function ScoutEvaluations({ playerId, evaluations, currentUserId, reportRatings = [] }: ScoutEvaluationsProps) {
  const [isPending, startTransition] = useTransition();
  const [hoverRating, setHoverRating] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const myEval = evaluations.find((e) => e.userId === currentUserId);
  const otherEvals = evaluations.filter((e) => e.userId !== currentUserId);

  // Active color for interactive stars (hover > myEval > default)
  const activeRating = hoverRating || myEval?.rating || 0;
  const activeColors = RATING_COLORS[activeRating] ?? DEFAULT_COLORS;

  // Global average: ALL scout evaluations (including mine) + scouting report ratings
  const allScoutRatings = evaluations.map((e) => e.rating);
  const globalRatings = [...allScoutRatings, ...reportRatings.map((r) => r.rating)];
  const globalAvg = globalRatings.length > 0
    ? Math.round((globalRatings.reduce((a, b) => a + b, 0) / globalRatings.length) * 10) / 10
    : 0;
  const globalAvgInt = Math.round(globalAvg);
  const globalColors = RATING_COLORS[globalAvgInt] ?? DEFAULT_COLORS;
  const globalCount = globalRatings.length;

  function handleRate(rating: number) {
    setError(null);
    if (myEval && myEval.rating === rating) {
      startTransition(async () => {
        const res = await deleteScoutEvaluation(playerId);
        if (!res.success) setError(res.error ?? 'Erro');
      });
      return;
    }
    startTransition(async () => {
      const res = await upsertScoutEvaluation(playerId, rating);
      if (!res.success) setError(res.error ?? 'Erro');
    });
  }

  return (
    <div className="space-y-3">
      {/* ───────────── My rating — interactive stars ───────────── */}
      {currentUserId && (
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-neutral-50/50 py-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">A tua avaliação</span>
          <div className={`flex gap-1 ${isPending ? 'opacity-50' : ''}`}>
            {Array.from({ length: 5 }, (_, i) => {
              const starNum = i + 1;
              const filled = hoverRating > 0 ? starNum <= hoverRating : (myEval ? starNum <= myEval.rating : false);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleRate(starNum)}
                  onMouseEnter={() => setHoverRating(starNum)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5 transition-transform hover:scale-125"
                  title={RATING_LABELS[starNum]}
                >
                  <Star
                    className={`h-7 w-7 ${filled ? activeColors.star : 'text-neutral-200'}`}
                    fill={filled ? 'currentColor' : 'none'}
                    strokeWidth={1.5}
                  />
                </button>
              );
            })}
          </div>
          {myEval && (() => {
            const c = RATING_COLORS[myEval.rating] ?? DEFAULT_COLORS;
            return (
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${c.text} ${c.bg}`}>
                {RATING_LABELS[myEval.rating]}
              </span>
            );
          })()}
          {!myEval && hoverRating > 0 && (
            <span className={`text-xs font-medium ${activeColors.text}`}>{RATING_LABELS[hoverRating]}</span>
          )}
          {!myEval && hoverRating === 0 && (
            <span className="text-[11px] text-muted-foreground/60">Clica para avaliar</span>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* ───────────── Global average — scout evals + report ratings, clickable for detail ───────────── */}
      {globalCount > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-center gap-2.5">
                <AggregatedStars avg={globalAvg} colorClass={globalColors.star} />
                <span className={`text-sm font-bold ${globalColors.text}`}>{globalAvg.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="text-xs">{globalCount} aval.</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Avaliação Global</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              {/* Current user's evaluation — pinned at top */}
              {myEval && (() => {
                const c = RATING_COLORS[myEval.rating] ?? DEFAULT_COLORS;
                return (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">A tua avaliação</p>
                    <div className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${c.bg} ${c.border}`}>
                      <span className={`text-lg font-black ${c.text}`}>{myEval.rating}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-800">{myEval.userName}</p>
                        <p className={`text-[10px] font-semibold ${c.text}`}>{RATING_LABELS[myEval.rating]}</p>
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i < myEval.rating ? c.star : 'text-neutral-200'}`} fill={i < myEval.rating ? 'currentColor' : 'none'} strokeWidth={1.5} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Scouting report ratings */}
              {reportRatings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Relatórios ({reportRatings.length})</p>
                  {reportRatings.map((r, i) => {
                    const c = RATING_COLORS[r.rating] ?? DEFAULT_COLORS;
                    return (
                      <div key={`report-${i}`} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${c.bg} ${c.border}`}>
                        <span className={`text-lg font-black ${c.text}`}>{r.rating}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">{r.scoutName || `Relatório #${i + 1}`}</p>
                          <p className={`text-[10px] font-semibold ${c.text}`}>{RATING_LABELS[r.rating]}</p>
                        </div>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }, (_, j) => (
                            <Star key={j} className={`h-3.5 w-3.5 ${j < r.rating ? c.star : 'text-neutral-200'}`} fill={j < r.rating ? 'currentColor' : 'none'} strokeWidth={1.5} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Other scouts' evaluations */}
              {otherEvals.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Scouts ({otherEvals.length})</p>
                  {[...otherEvals]
                    .sort((a, b) => b.rating - a.rating || a.userName.localeCompare(b.userName))
                    .map((ev) => {
                      const c = RATING_COLORS[ev.rating] ?? DEFAULT_COLORS;
                      return (
                        <div key={ev.id} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${c.bg} ${c.border}`}>
                          <span className={`text-lg font-black ${c.text}`}>{ev.rating}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-neutral-800">{ev.userName}</p>
                            <p className={`text-[10px] font-semibold ${c.text}`}>{RATING_LABELS[ev.rating]}</p>
                          </div>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star key={i} className={`h-3.5 w-3.5 ${i < ev.rating ? c.star : 'text-neutral-200'}`} fill={i < ev.rating ? 'currentColor' : 'none'} strokeWidth={1.5} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Empty state */}
      {evaluations.length === 0 && !currentUserId && (
        <p className="text-sm text-muted-foreground">Sem avaliações</p>
      )}
    </div>
  );
}
