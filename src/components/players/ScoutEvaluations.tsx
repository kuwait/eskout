// src/components/players/ScoutEvaluations.tsx
// Scout evaluation widget — interactive stars for current user + aggregated team stars with popup detail
// Scales to any number of evaluations. One evaluation per scout per player, upserted on click.
// RELEVANT FILES: src/actions/evaluations.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useId, useState, useTransition } from 'react';
import { Star, ChevronRight, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogClose,
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
  /** Which part to render: 'all' (default), 'personal' (my stars only), 'team' (aggregate bar only) */
  part?: 'all' | 'personal' | 'team';
  /** Compact mode — smaller stars, less padding (for embedding in header) */
  compact?: boolean;
  /** Extra className for the root container */
  className?: string;
}

/* ───────────── Component ───────────── */

export function ScoutEvaluations({ playerId, evaluations, currentUserId, reportRatings = [], part = 'all', compact = false, className }: ScoutEvaluationsProps) {
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

  const showPersonal = part === 'all' || part === 'personal';
  const showTeam = part === 'all' || part === 'team';

  return (
    <div className={className ?? 'space-y-3'}>
      {/* ───────────── My rating — interactive stars ───────────── */}
      {showPersonal && currentUserId && (
        <div className={`flex flex-col items-center rounded-lg border bg-neutral-50/50 ${compact ? 'h-full w-full justify-center gap-1 px-2 py-1' : 'gap-2 py-4'}`}>
          <span className={`font-semibold uppercase tracking-widest text-muted-foreground ${compact ? 'text-[9px]' : 'text-[10px]'}`}>A tua avaliação</span>
          <div className={`flex gap-0.5 ${isPending ? 'opacity-50' : ''}`}>
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
                  className={`transition-transform hover:scale-125 ${compact ? 'p-0' : 'p-0.5'}`}
                  title={RATING_LABELS[starNum]}
                >
                  <Star
                    className={`${compact ? 'h-5 w-5' : 'h-7 w-7'} ${filled ? activeColors.star : 'text-neutral-200'}`}
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
              <span className={`rounded-full font-bold ${c.text} ${c.bg} ${compact ? 'px-2 py-0 text-[10px]' : 'px-3 py-0.5 text-xs'}`}>
                {RATING_LABELS[myEval.rating]}
              </span>
            );
          })()}
          {!myEval && hoverRating > 0 && (
            <span className={`font-medium ${activeColors.text} ${compact ? 'text-[10px]' : 'text-xs'}`}>{RATING_LABELS[hoverRating]}</span>
          )}
          {!myEval && hoverRating === 0 && (
            <span className={`text-muted-foreground/60 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>Clica para avaliar</span>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* ───────────── Global average — scout evals + report ratings, clickable for detail ───────────── */}
      {showTeam && globalCount > 0 && (
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
          <DialogContent showCloseButton={false} className="flex max-h-[85dvh] max-w-sm flex-col gap-0 overflow-hidden p-0 sm:max-h-[70vh]">
            {/* ── Minimal top bar — drag handle + close ── */}
            <div className="relative shrink-0 pb-1 pt-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-neutral-300" />
              <DialogClose className="absolute right-2 top-2 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar</span>
              </DialogClose>
              <DialogTitle className="sr-only">Avaliações</DialogTitle>
            </div>

            {/* ── Scrollable evaluation list — grouped by source ── */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-1 px-3 pb-4">
                {/* My evaluation — highlighted card */}
                {myEval && (
                  <EvalSection label="A tua avaliação">
                    <EvalRow name={myEval.userName} rating={myEval.rating} highlight />
                  </EvalSection>
                )}
                {/* Scouting report ratings */}
                {reportRatings.length > 0 && (
                  <EvalSection label={`Relatórios (${reportRatings.length})`}>
                    {reportRatings.map((r, i) => (
                      <EvalRow key={`report-${i}`} name={r.scoutName || `Relatório #${i + 1}`} rating={r.rating} />
                    ))}
                  </EvalSection>
                )}
                {/* Other scouts */}
                {otherEvals.length > 0 && (
                  <EvalSection label={`Scouts (${otherEvals.length})`}>
                    {[...otherEvals]
                      .sort((a, b) => b.rating - a.rating || a.userName.localeCompare(b.userName))
                      .map((ev) => (
                        <EvalRow key={ev.id} name={ev.userName} rating={ev.rating} />
                      ))}
                  </EvalSection>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Empty state */}
      {showTeam && evaluations.length === 0 && !currentUserId && (
        <p className="text-sm text-muted-foreground">Sem avaliações</p>
      )}
    </div>
  );
}

/* ───────────── EvalRow — compact evaluation row for the detail popup ───────────── */

/** Section wrapper — label + grouped card with dividers between rows */
function EvalSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 first:pt-0">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-neutral-400">{label}</span>
        <div className="h-px flex-1 bg-neutral-100" />
      </div>
      <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100 bg-white">{children}</div>
    </div>
  );
}

/** Individual evaluation row — colored accent strip, avatar, name, stars, rating number */
function EvalRow({ name, rating, highlight }: { name: string; rating: number; highlight?: boolean }) {
  const c = RATING_COLORS[rating] ?? DEFAULT_COLORS;
  return (
    <div className={`group relative flex items-center gap-2.5 py-3 pl-4 pr-2 ${highlight ? c.bg : 'hover:bg-neutral-50/50'}`}>
      {/* Left accent strip */}
      <div className={`absolute left-0 top-[25%] h-[50%] w-[3px] rounded-r-full ${c.star.replace('text-', 'bg-')}`} />
      {/* Avatar — small, colored */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${c.star.replace('text-', 'bg-')}`}>
        {name.charAt(0).toUpperCase()}
      </div>
      {/* Name + stars row */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-tight text-neutral-500">{name}</p>
        <div className="mt-0.5 flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={`h-2.5 w-2.5 ${i < rating ? c.star : 'text-neutral-300'}`} fill="currentColor" strokeWidth={i < rating ? 1.5 : 0} />
          ))}
        </div>
      </div>
      {/* Rating number + label — fixed width so they align across rows */}
      <div className="flex w-12 shrink-0 flex-col items-center">
        <span className={`text-sm font-black leading-none ${c.text} opacity-50`}>{rating}</span>
        <span className={`mt-0.5 text-[8px] font-medium ${c.text} opacity-40`}>{RATING_LABELS[rating]}</span>
      </div>
    </div>
  );
}
