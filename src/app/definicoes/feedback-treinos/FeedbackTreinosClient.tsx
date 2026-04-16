// src/app/definicoes/feedback-treinos/FeedbackTreinosClient.tsx
// Client component for the admin training feedback list — filters by escalão, decision, search
// Shows all training feedbacks for the club ordered by most recent, with player context
// RELEVANT FILES: src/app/definicoes/feedback-treinos/page.tsx, src/lib/types/index.ts, src/components/players/TrainingFeedback.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ClipboardList, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  TRAINING_DECISIONS,
  TRAINING_TAG_LABEL_MAP,
  TRAINING_TAG_CATEGORIES,
  HEIGHT_SCALE_OPTIONS,
  BUILD_SCALE_OPTIONS,
  SPEED_SCALE_OPTIONS,
  INTENSITY_SCALE_OPTIONS,
  MATURATION_SCALE_OPTIONS,
} from '@/lib/constants';
import { markTrainingFeedbacksSeen } from '@/actions/training-feedback';
import type { TrainingFeedbackWithPlayer, TrainingDecision } from '@/lib/types';

/* ───────────── Constants ───────────── */

const DECISION_FILTER_OPTIONS: { value: TrainingDecision | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'assinar', label: 'Assinar' },
  { value: 'repetir', label: 'Repetir' },
  { value: 'duvidas', label: 'Dúvidas' },
  { value: 'descartar', label: 'Descartar' },
  { value: 'sem_decisao', label: 'Sem decisão' },
];

const BAR_COLORS: Record<number, string> = { 1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-sky-500', 4: 'bg-teal-500', 5: 'bg-green-500' };
const RATING_TEXT_COLORS: Record<number, string> = { 1: 'text-red-600', 2: 'text-orange-500', 3: 'text-sky-600', 4: 'text-teal-600', 5: 'text-green-600' };

const PAGE_SIZE = 50;

/* ───────────── Component ───────────── */

export function FeedbackTreinosClient({ feedbacks }: { feedbacks: TrainingFeedbackWithPlayer[] }) {
  const [search, setSearch] = useState('');
  const [escalaoFilter, setEscalaoFilter] = useState('all');
  const [decisionFilter, setDecisionFilter] = useState<TrainingDecision | 'all'>('all');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [page, setPage] = useState(0);

  // Mark feedbacks as seen when leaving the page (clears badge on next render)
  useEffect(() => {
    return () => { markTrainingFeedbacksSeen(); };
  }, []);

  // Extract unique escalões from the data
  const escaloes = useMemo(() => {
    const set = new Set<string>();
    for (const f of feedbacks) {
      if (f.escalao) set.add(f.escalao);
    }
    return Array.from(set).sort();
  }, [feedbacks]);

  // Extract unique authors
  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of feedbacks) {
      if (f.authorName && f.authorId) map.set(f.authorId, f.authorName);
      if (f.coachName) map.set(`coach-${f.coachName}`, f.coachName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [feedbacks]);

  // Filter feedbacks
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return feedbacks.filter((f) => {
      if (escalaoFilter !== 'all' && f.escalao !== escalaoFilter) return false;
      // Resolve effective decision (coach overrides internal)
      const effectiveDecision = f.coachDecision ?? f.decision;
      if (decisionFilter !== 'all' && effectiveDecision !== decisionFilter) return false;
      if (q && !f.playerName.toLowerCase().includes(q) && !f.playerClub?.toLowerCase().includes(q)) return false;
      if (authorFilter !== 'all') {
        const matchesAuthor = f.authorId === authorFilter || (authorFilter.startsWith('coach-') && f.coachName === authorFilter.slice(6));
        if (!matchesAuthor) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort by most recent activity (coach submission or creation)
      const aDate = a.coachSubmittedAt ?? a.createdAt;
      const bDate = b.coachSubmittedAt ?? b.createdAt;
      return bDate.localeCompare(aDate);
    });
  }, [feedbacks, search, escalaoFilter, decisionFilter, authorFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  // Clamp page if filters reduce total pages below current page
  const clampedPage = Math.min(page, Math.max(0, totalPages - 1));
  const pageItems = filtered.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);
  const hasActiveFilters = search || escalaoFilter !== 'all' || decisionFilter !== 'all' || authorFilter !== 'all';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-neutral-900 sm:text-xl">Feedback de Treinos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {feedbacks.length} feedback{feedbacks.length !== 1 ? 's' : ''} registado{feedbacks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar jogador ou clube..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-9 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-neutral-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Escalão + Decision filters */}
        <div className="flex gap-2">
          <select
            value={escalaoFilter}
            onChange={(e) => { setEscalaoFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="all">Todos escalões</option>
            {escaloes.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select
            value={decisionFilter}
            onChange={(e) => { setDecisionFilter(e.target.value as TrainingDecision | 'all'); setPage(0); }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            {DECISION_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={authorFilter}
            onChange={(e) => { setAuthorFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="all">Todos autores</option>
            {authors.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearch(''); setEscalaoFilter('all'); setDecisionFilter('all'); setAuthorFilter('all'); }}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-neutral-50"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Count + pagination info */}
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} feedback{filtered.length !== 1 ? 's' : ''}{hasActiveFilters ? ' encontrado' + (filtered.length !== 1 ? 's' : '') : ''}</span>
        {totalPages > 1 && (
          <span>Página {clampedPage + 1} de {totalPages}</span>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-500">
            {hasActiveFilters ? 'Nenhum resultado encontrado' : 'Sem feedback de treino registado'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pageItems.map((f) => (
            <FeedbackCard key={f.id} feedback={f} />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <PaginationControls page={clampedPage} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}

/* ───────────── Feedback Card ───────────── */

function FeedbackCard({ feedback: f }: { feedback: TrainingFeedbackWithPlayer }) {
  const dateLabel = new Date(f.trainingDate).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  // Merge internal + coach data (coach takes priority)
  const rPerf = f.coachRatingPerformance ?? f.ratingPerformance;
  const rPot = f.coachRatingPotential ?? f.ratingPotential;
  const decision = f.coachDecision ?? (f.decision !== 'sem_decisao' ? f.decision : null);
  const decisionConfig = decision ? TRAINING_DECISIONS.find((d) => d.value === decision) : null;
  const feedbackText = f.coachFeedback ?? f.feedback;
  const authorName = f.coachSubmittedAt ? f.coachName : (f.feedback || f.ratingPerformance) ? f.authorName : null;
  const hasCoach = !!f.coachSubmittedAt;

  // Physical scales (merged)
  const physicalPairs: { category: string; label: string }[] = [];
  const hs = f.coachHeightScale ?? f.heightScale;
  const bs = f.coachBuildScale ?? f.buildScale;
  const ss = f.coachSpeedScale ?? f.speedScale;
  const is_ = f.coachIntensityScale ?? f.intensityScale;
  const ms = f.coachMaturation ?? f.maturation;
  if (hs) { const o = HEIGHT_SCALE_OPTIONS.find((x) => x.value === hs); if (o) physicalPairs.push({ category: 'Estatura', label: o.labelPt }); }
  if (bs) { const o = BUILD_SCALE_OPTIONS.find((x) => x.value === bs); if (o) physicalPairs.push({ category: 'Corpo', label: o.labelPt }); }
  if (ss) { const o = SPEED_SCALE_OPTIONS.find((x) => x.value === ss); if (o) physicalPairs.push({ category: 'Velocidade', label: o.labelPt }); }
  if (is_) { const o = INTENSITY_SCALE_OPTIONS.find((x) => x.value === is_); if (o) physicalPairs.push({ category: 'Intensidade', label: o.labelPt }); }
  if (ms) { const o = MATURATION_SCALE_OPTIONS.find((x) => x.value === ms); if (o) physicalPairs.push({ category: 'Maturação', label: o.labelPt }); }

  // Tags (merged)
  const allTags = f.coachTags.length > 0 ? f.coachTags : f.tags;
  const tagsByCategory = allTags.map((tag) => {
    const cat = TRAINING_TAG_CATEGORIES.find((c) => c.tags.some((t) => t.value === tag));
    return { value: tag, label: TRAINING_TAG_LABEL_MAP[tag] ?? tag, category: cat?.category ?? '' };
  });

  const mainRating = rPerf ?? 0;
  const ratingBg = mainRating >= 4 ? 'bg-green-50' : mainRating === 3 ? 'bg-sky-50' : mainRating === 2 ? 'bg-orange-50' : mainRating >= 1 ? 'bg-red-50' : 'bg-neutral-50';
  const ratingBorder = mainRating >= 4 ? 'border-green-200' : mainRating === 3 ? 'border-sky-200' : mainRating === 2 ? 'border-orange-200' : mainRating >= 1 ? 'border-red-200' : 'border-neutral-200';
  const dotColor = BAR_COLORS[mainRating] ?? 'bg-neutral-400';

  return (
    <div className={cn('overflow-hidden rounded-lg border', ratingBorder)}>
      {/* Header — player info left, rating/decision right */}
      <div className={cn('flex items-center gap-3 px-3 py-2.5', ratingBg)}>
        <div className="min-w-0 flex-1">
          <PlayerHeader feedback={f} dateLabel={dateLabel} />
        </div>

        {/* Rating + decision — right side */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              {f.escalao && (
                <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{f.escalao}</span>
              )}
              {decisionConfig && (
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', decisionConfig.colorActive)}>
                  {decisionConfig.labelPt}
                </span>
              )}
            </div>
            {authorName && (
              <span className="text-[11px] text-muted-foreground">
                {hasCoach ? `Mister ${authorName}` : authorName}
              </span>
            )}
          </div>
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', dotColor)}>
            {mainRating || '–'}
          </div>
        </div>
      </div>

      {/* Body — ratings, physical, tags, feedback */}
      <div className="px-3 py-3 space-y-3">
        {/* Rating bars */}
        {rPerf && (
          <RatingBar emoji="⭐" label="Rendimento" value={rPerf} />
        )}
        {rPot && (
          <RatingBar emoji="📈" label="Potencial" value={rPot} />
        )}

        {/* Physical pills */}
        {physicalPairs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {physicalPairs.map((p) => (
              <span key={p.category} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                {p.category}: {p.label}
              </span>
            ))}
          </div>
        )}

        {/* Tags */}
        {tagsByCategory.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagsByCategory.map((t) => {
              const colorClass = t.category === 'tecnica' ? 'bg-blue-50 text-blue-600 border-blue-200'
                : t.category === 'tatico' ? 'bg-teal-50 text-teal-600 border-teal-200'
                : t.category === 'mental' ? 'bg-purple-50 text-purple-600 border-purple-200'
                : 'bg-amber-50 text-amber-600 border-amber-200';
              return (
                <span key={t.value} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', colorClass)}>
                  {t.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Feedback text */}
        {feedbackText && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
            <p className="text-[10px] font-bold text-green-700 mb-1">Notas</p>
            <p className="text-sm leading-relaxed text-neutral-700">{feedbackText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── Player Header ───────────── */

function PlayerHeader({ feedback: f, dateLabel }: { feedback: TrainingFeedbackWithPlayer; dateLabel: string }) {
  return (
    <Link href={`/jogadores/${f.playerId}`} className="flex items-center gap-3 group">
      {/* Photo — square with rounded corners like player profile */}
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
        {f.playerPhotoUrl ? (
          <Image src={f.playerPhotoUrl} alt={f.playerName} fill className="object-cover" sizes="48px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-neutral-400">
            {f.playerName.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900 group-hover:underline">{f.playerName}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{dateLabel}</span>
          {f.playerPosition && <span>· {f.playerPosition}</span>}
          {f.playerClub && <span>· {f.playerClub}</span>}
        </div>
      </div>
    </Link>
  );
}

/* ───────────── Rating Bar ───────────── */

function RatingBar({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-semibold">{label}</span>
        <span className={cn('text-sm font-black', RATING_TEXT_COLORS[value] ?? 'text-neutral-500')}>{value}</span>
      </div>
      <div className="flex h-2 w-full gap-0.5 rounded-md overflow-hidden">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className={cn('flex-1', n <= value ? (BAR_COLORS[value] ?? 'bg-neutral-300') : 'bg-neutral-100')} />
        ))}
      </div>
    </div>
  );
}

/* ───────────── Pagination ───────────── */

function PaginationControls({ page, totalPages, onPageChange }: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // Show at most 5 page buttons centered around current page
  const maxButtons = 5;
  let start = Math.max(0, page - Math.floor(maxButtons / 2));
  const end = Math.min(totalPages, start + maxButtons);
  if (end - start < maxButtons) start = Math.max(0, end - maxButtons);
  const pages = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {pages.map((p) => (
        <Button
          key={p}
          variant={p === page ? 'default' : 'outline'}
          size="sm"
          className="h-8 w-8 px-0"
          onClick={() => onPageChange(p)}
        >
          {p + 1}
        </Button>
      ))}

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página seguinte"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
