// src/components/players/QuickReportForm.tsx
// Mobile-first tap-based quick evaluation form for player scouting
// Large touch targets (48px), horizontal tag chips, sticky submit
// RELEVANT FILES: src/actions/quick-scout-reports.ts, src/lib/constants/quick-report-tags.ts

'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { ChevronDown, Send, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { submitQuickReport } from '@/actions/quick-scout-reports';
import { DIMENSIONS, RECOMMENDATIONS, getTagsForDimension, type DimensionKey, type Tag } from '@/lib/constants/quick-report-tags';
import type { QuickReportRecommendation } from '@/lib/types';

/* ───────────── Types ───────────── */

interface QuickReportFormProps {
  playerId: number;
  playerName: string;
  isGoalkeeper: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  /** Called when form dirty state changes (has any data filled) */
  onDirtyChange?: (dirty: boolean) => void;
}

interface FormState {
  ratings: Record<DimensionKey, number>;
  tags: Record<DimensionKey, string[]>;
  ratingOverall: number;
  recommendation: QuickReportRecommendation | '';
  competition: string;
  opponent: string;
  matchDate: string;
  notes: string;
}

const EMPTY_STATE: FormState = {
  ratings: { tecnica: 0, tatica: 0, fisico: 0, mentalidade: 0, potencial: 0 },
  tags: { tecnica: [], tatica: [], fisico: [], mentalidade: [], potencial: [] },
  ratingOverall: 0,
  recommendation: '',
  competition: '',
  opponent: '',
  matchDate: '',
  notes: '',
};

/* ───────────── Component ───────────── */

/** Check if form has any data filled */
function isDirty(form: FormState): boolean {
  return Object.values(form.ratings).some(r => r > 0)
    || Object.values(form.tags).some(t => t.length > 0)
    || form.ratingOverall > 0
    || form.recommendation !== ''
    || form.competition !== ''
    || form.opponent !== ''
    || form.matchDate !== ''
    || form.notes !== '';
}

export function QuickReportForm({ playerId, playerName, isGoalkeeper, onSuccess, onCancel, onDirtyChange }: QuickReportFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [showContext, setShowContext] = useState(false);
  const [isPending, startTransition] = useTransition();
  const prevDirty = useRef(false);

  // Notify parent when dirty state changes
  useEffect(() => {
    const dirty = isDirty(form);
    if (dirty !== prevDirty.current) {
      prevDirty.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [form, onDirtyChange]);

  /* ───────────── Handlers ───────────── */

  function setRating(dimension: DimensionKey, value: number) {
    setForm(prev => ({ ...prev, ratings: { ...prev.ratings, [dimension]: value } }));
  }

  function toggleTag(dimension: DimensionKey, tag: string) {
    setForm(prev => {
      const current = prev.tags[dimension];
      const next = current.includes(tag)
        ? current.filter(t => t !== tag)
        : [...current, tag];
      return { ...prev, tags: { ...prev.tags, [dimension]: next } };
    });
  }

  function setOverall(value: number) {
    setForm(prev => ({ ...prev, ratingOverall: value }));
  }

  function setRecommendation(value: QuickReportRecommendation) {
    setForm(prev => ({ ...prev, recommendation: value }));
  }

  const allRated = Object.values(form.ratings).every(r => r > 0) && form.ratingOverall > 0 && form.recommendation !== '';

  function handleSubmit() {
    if (!allRated) {
      toast.error('Preenche todas as avaliações e a recomendação');
      return;
    }

    startTransition(async () => {
      const result = await submitQuickReport({
        playerId,
        ratingTecnica: form.ratings.tecnica,
        ratingTatica: form.ratings.tatica,
        ratingFisico: form.ratings.fisico,
        ratingMentalidade: form.ratings.mentalidade,
        ratingPotencial: form.ratings.potencial,
        ratingOverall: form.ratingOverall,
        recommendation: form.recommendation as QuickReportRecommendation,
        tagsTecnica: form.tags.tecnica,
        tagsTatica: form.tags.tatica,
        tagsFisico: form.tags.fisico,
        tagsMentalidade: form.tags.mentalidade,
        tagsPotencial: form.tags.potencial,
        competition: form.competition || undefined,
        opponent: form.opponent || undefined,
        matchDate: form.matchDate || undefined,
        notes: form.notes || undefined,
      });

      if (result.success) {
        toast.success('Avaliação submetida');
        onSuccess?.();
      } else {
        toast.error(result.error ?? 'Erro ao submeter');
      }
    });
  }

  return (
    <div className="space-y-3 overflow-hidden px-1">
      {/* Dimension cards */}
      {DIMENSIONS.map(dim => (
        <DimensionCard
          key={dim.key}
          dimension={dim}
          rating={form.ratings[dim.key]}
          selectedTags={form.tags[dim.key]}
          isGoalkeeper={isGoalkeeper}
          onRate={(v) => setRating(dim.key, v)}
          onToggleTag={(tag) => toggleTag(dim.key, tag)}
        />
      ))}

      {/* Overall + Recommendation */}
      <div className="rounded-xl border bg-white px-4 py-3.5 space-y-3">
        {(() => {
          const ratedValues = Object.values(form.ratings).filter(r => r > 0);
          const avg = ratedValues.length > 0 ? ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length : 0;
          const avgDisplay = avg > 0 ? (Number.isInteger(avg) ? String(avg) : avg.toFixed(1)) : null;
          return (
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">⭐ Global</span>
              <div className="flex items-center gap-2">
                {avgDisplay && (
                  <span className="text-[11px] text-muted-foreground/50">
                    Média: <span className="font-semibold">{avgDisplay}</span>
                  </span>
                )}
                {form.ratingOverall > 0 && (
                  <span className={cn('text-sm font-black', getStarColor(form.ratingOverall))}>
                    {Number.isInteger(form.ratingOverall) ? form.ratingOverall : form.ratingOverall.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Half-star rating — tap left half = X.0, right half = X.5 */}
        <HalfStarRating value={form.ratingOverall} onChange={setOverall} />

        <div className="flex gap-2">
          {RECOMMENDATIONS.map(rec => (
            <button
              key={rec.value}
              type="button"
              onClick={() => setRecommendation(rec.value)}
              className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                form.recommendation === rec.value
                  ? rec.color + ' ring-2 ring-offset-1 ring-neutral-900'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {rec.label}
            </button>
          ))}
        </div>
      </div>

      {/* Match context (collapsible) */}
      <div className="rounded-lg border bg-white">
        <button
          type="button"
          onClick={() => setShowContext(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">Contexto do Jogo <span className="text-[11px] font-normal text-muted-foreground/50">opcional</span></span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showContext ? 'rotate-180' : ''}`} />
        </button>
        {showContext && (
          <div className="space-y-3 border-t px-4 py-3">
            <div>
              <label className="text-xs text-muted-foreground">Competição</label>
              <Input
                value={form.competition}
                onChange={e => setForm(prev => ({ ...prev, competition: e.target.value }))}
                placeholder="Ex: Campeonato Distrital Sub-15"
                className="mt-1 h-10 placeholder:text-xs placeholder:text-muted-foreground/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Jogo</label>
              <Input
                value={form.opponent}
                onChange={e => setForm(prev => ({ ...prev, opponent: e.target.value }))}
                placeholder="Ex: Boavista vs Leixões S.C."
                className="mt-1 h-10 placeholder:text-xs placeholder:text-muted-foreground/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data do jogo</label>
              <Input
                type="date"
                value={form.matchDate}
                onChange={e => setForm(prev => ({ ...prev, matchDate: e.target.value }))}
                className={cn('mt-1 h-10', !form.matchDate && 'text-muted-foreground/40 text-xs')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-lg border bg-white p-4">
        <label className="text-sm font-semibold">Notas <span className="ml-1 text-[11px] font-normal text-muted-foreground/50">opcional</span></label>
        <Textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Observações adicionais sobre o jogador..."
          className="mt-2 resize-none pt-[10px] placeholder:text-xs placeholder:text-muted-foreground/40"
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pb-[env(safe-area-inset-bottom)] pt-4">
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-xl">
              Cancelar
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!allRated || isPending}
            className="flex-1 h-12 rounded-xl text-base"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Send className="mr-2 h-5 w-5" />
            )}
            Submeter
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Dimension Card ───────────── */

function DimensionCard({
  dimension,
  rating,
  selectedTags,
  isGoalkeeper,
  onRate,
  onToggleTag,
}: {
  dimension: typeof DIMENSIONS[number];
  rating: number;
  selectedTags: string[];
  isGoalkeeper: boolean;
  onRate: (v: number) => void;
  onToggleTag: (tag: string) => void;
}) {
  const tags = getTagsForDimension(dimension.key, isGoalkeeper);
  const [manualExpand, setManualExpand] = useState(false);
  // Tags only visible after rating is set
  const expanded = rating > 0 && (manualExpand || selectedTags.length > 0);

  return (
    <div className={cn(
      'rounded-xl border bg-white border-l-[3px] overflow-hidden',
      dimension.borderColor,
    )}>
      {/* Header — label + segmented bar + score */}
      <button
        type="button"
        onClick={() => { if (rating > 0) setManualExpand(v => !v); }}
        className="flex w-full items-center gap-3 px-4 py-3"
      >
        <span className="text-base">{dimension.emoji}</span>
        <span className="flex-1 text-left text-sm font-semibold">{dimension.label}</span>
        {/* Score badge */}
        <span className={cn(
          'text-lg font-black tabular-nums w-6 text-right transition-colors',
          rating > 0 ? dimension.textColor : 'text-neutral-300',
        )}>
          {rating > 0 ? rating : '—'}
        </span>
        {rating > 0 && <ChevronDown className={cn('h-4 w-4 text-neutral-400 transition-transform', expanded && 'rotate-180')} />}
      </button>

      {/* Segmented rating bar — always visible */}
      <div className="px-4 pb-3">
        <div className="flex h-10 w-full gap-0.5 rounded-lg overflow-hidden">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => { const newVal = rating === n ? 0 : n; onRate(newVal); if (newVal > 0) setManualExpand(true); }}
              className={cn(
                'flex-1 flex items-center justify-center text-xs font-bold transition-all active:scale-95',
                n <= rating ? `${dimension.color} text-white` : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200',
                n === 1 && 'rounded-l-lg',
                n === 5 && 'rounded-r-lg',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Tags — expand on tap or after rating */}
      {expanded && (
        <TagsSection
          tags={tags}
          selectedTags={selectedTags}
          onToggleTag={onToggleTag}
        />
      )}
    </div>
  );
}

/* ───────────── Half-Star Rating (0.5 increments, color-coded) ───────────── */

/** Color based on overall value — red(1) → orange(2) → yellow(3) → blue(4) → green(5) */
/* ───────────── Tags Section (with custom tag input) ───────────── */

function TagsSection({ tags, selectedTags, onToggleTag }: {
  tags: Tag[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [inputMode, setInputMode] = useState<'positive' | 'negative' | null>(null);

  function addCustom(sentiment: 'positive' | 'negative') {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    const prefixed = sentiment === 'negative' ? `⊖ ${trimmed}` : `⊕ ${trimmed}`;
    if (!selectedTags.includes(prefixed)) onToggleTag(prefixed);
    setCustomTag('');
    setShowInput(false);
  }

  // Custom tags = selected tags not in the predefined list
  const predefinedLabels = new Set(tags.map(t => t.label));
  const customTags = selectedTags.filter(t => !predefinedLabels.has(t));

  return (
    <div className="border-t px-4 py-3 flex flex-wrap gap-1.5">
      {tags.map(tag => {
        const selected = selectedTags.includes(tag.label);
        const isPositive = tag.sentiment === 'positive';
        return (
          <button
            key={tag.label}
            type="button"
            onClick={() => onToggleTag(tag.label)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95',
              selected && isPositive && 'border-emerald-500 bg-emerald-500 text-white',
              selected && !isPositive && 'border-rose-500 bg-rose-500 text-white',
              !selected && isPositive && 'border-neutral-200 bg-white text-neutral-600 hover:border-emerald-300 hover:bg-emerald-50',
              !selected && !isPositive && 'border-neutral-200 bg-white text-neutral-400 hover:border-rose-300 hover:bg-rose-50',
            )}
          >
            {tag.label}
          </button>
        );
      })}
      {/* Custom tags already added */}
      {customTags.map(t => {
        const isNeg = t.startsWith('⊖');
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggleTag(t)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95',
              isNeg ? 'border-rose-500 bg-rose-500 text-white' : 'border-emerald-500 bg-emerald-500 text-white',
            )}
          >
            {t.replace(/^[⊕⊖]\s*/, '')}
          </button>
        );
      })}
      {/* Add custom tag */}
      {showInput ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setShowInput(false); setCustomTag(''); setInputMode(null); } }}
            placeholder="Escrever..."
            className="w-28 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-neutral-500"
            maxLength={30}
          />
          <button
            type="button"
            onClick={() => { if (customTag.trim()) addCustom('positive'); }}
            className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-600"
            title="Positivo"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => { if (customTag.trim()) addCustom('negative'); }}
            className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-600"
            title="Negativo"
          >
            −
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="shrink-0 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:border-neutral-400 hover:text-neutral-500 transition-colors"
        >
          + Outro
        </button>
      )}
    </div>
  );
}

/** Unified 1-5 color scale: 1=red, 2=orange, 3=sky, 4=teal, 5=green */
export function getStarColor(value: number): string {
  const key = Math.ceil(value) || 1;
  const colors: Record<number, string> = {
    1: 'text-red-500',
    2: 'text-orange-400',
    3: 'text-sky-500',
    4: 'text-teal-500',
    5: 'text-green-500',
  };
  return colors[key] ?? 'text-red-500';
}

export function HalfStarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hoverValue, setHoverValue] = useState(0);
  const displayValue = hoverValue > 0 && value === 0 ? hoverValue : value;
  const colorClass = displayValue > 0 ? getStarColor(displayValue) : '';

  function handleClick(clickValue: number) {
    // Deselect if clicking same value
    onChange(value === clickValue ? 0 : clickValue);
  }

  return (
    <div className="flex justify-center gap-1" onMouseLeave={() => setHoverValue(0)}>
      {[1, 2, 3, 4, 5].map(starNum => {
        const filled = displayValue >= starNum;
        const halfFilled = !filled && displayValue >= starNum - 0.5;

        return (
          <div key={starNum} className="relative h-11 w-11 cursor-pointer">
            {/* Background empty star */}
            <Star className="absolute inset-0 m-auto h-9 w-9 text-neutral-200" fill="none" strokeWidth={1.5} />

            {/* Filled or half-filled star */}
            {(filled || halfFilled) && (
              <svg className="absolute inset-0 m-auto h-9 w-9" viewBox="0 0 24 24">
                {halfFilled && (
                  <defs>
                    <clipPath id={`half-${starNum}`}>
                      <rect x="0" y="0" width="12" height="24" />
                    </clipPath>
                  </defs>
                )}
                <Star
                  className={cn('h-9 w-9 transition-colors', colorClass)}
                  fill="currentColor"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  clipPath={halfFilled ? `url(#half-${starNum})` : undefined}
                />
              </svg>
            )}

            {/* Touch zones — left half = X-0.5, right half = X.0 */}
            <button
              type="button"
              onClick={() => handleClick(starNum - 0.5)}
              onMouseEnter={() => setHoverValue(starNum - 0.5)}
              className="absolute left-0 top-0 h-full w-1/2"
              aria-label={`${starNum - 0.5} estrelas`}
            />
            <button
              type="button"
              onClick={() => handleClick(starNum)}
              onMouseEnter={() => setHoverValue(starNum)}
              className="absolute right-0 top-0 h-full w-1/2"
              aria-label={`${starNum} estrelas`}
            />
          </div>
        );
      })}
    </div>
  );
}
