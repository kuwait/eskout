// src/components/players/QuickReportForm.tsx
// Mobile-first tap-based quick evaluation form for player scouting
// Large touch targets (48px), horizontal tag chips, sticky submit
// RELEVANT FILES: src/actions/quick-scout-reports.ts, src/lib/constants/quick-report-tags.ts

'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { ChevronDown, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { submitQuickReport } from '@/actions/quick-scout-reports';
import { DIMENSIONS, RECOMMENDATIONS, getTagsForDimension, type DimensionKey } from '@/lib/constants/quick-report-tags';
import type { QuickReportRecommendation } from '@/lib/types';

/* ───────────── Types ───────────── */

interface QuickReportFormProps {
  playerId: number;
  playerName: string;
  isGoalkeeper: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
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

/* ───────────── localStorage Draft ───────────── */

function getDraftKey(playerId: number) { return `eskout-quick-draft-${playerId}`; }

function saveDraft(playerId: number, state: FormState) {
  try { localStorage.setItem(getDraftKey(playerId), JSON.stringify(state)); } catch { /* quota */ }
}

function loadDraft(playerId: number): FormState | null {
  try {
    const raw = localStorage.getItem(getDraftKey(playerId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearDraft(playerId: number) {
  try { localStorage.removeItem(getDraftKey(playerId)); } catch { /* */ }
}

/* ───────────── Component ───────────── */

export function QuickReportForm({ playerId, playerName, isGoalkeeper, onSuccess, onCancel }: QuickReportFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [showContext, setShowContext] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load draft on mount
  /* eslint-disable react-hooks/set-state-in-effect -- restore draft on mount */
  useEffect(() => {
    const draft = loadDraft(playerId);
    if (draft) {
      setForm(draft);
      setHasDraft(true);
    }
  }, [playerId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-save draft on change (debounced)
  const debouncedSave = useCallback(() => {
    const timer = setTimeout(() => saveDraft(playerId, form), 500);
    return () => clearTimeout(timer);
  }, [playerId, form]);
  useEffect(debouncedSave, [debouncedSave]);

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

    // Offline detection — save draft and inform user
    if (!navigator.onLine) {
      saveDraft(playerId, form);
      toast.info('Sem ligação à internet — rascunho guardado localmente. Abre novamente quando tiveres ligação para submeter.');
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
        clearDraft(playerId);
        toast.success('Avaliação submetida');
        onSuccess?.();
      } else {
        // Check if offline — save draft and inform user
        if (!navigator.onLine) {
          saveDraft(playerId, form);
          toast.info('Sem ligação — rascunho guardado. Submete quando tiveres internet.');
        } else {
          toast.error(result.error ?? 'Erro ao submeter');
        }
      }
    });
  }

  function handleDiscard() {
    clearDraft(playerId);
    setForm(EMPTY_STATE);
    setHasDraft(false);
  }

  return (
    <div className="space-y-3 overflow-hidden px-1">
      {/* Draft banner */}
      {hasDraft && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>Rascunho pendente</span>
          <button type="button" onClick={handleDiscard} className="font-medium hover:text-amber-900">
            Descartar
          </button>
        </div>
      )}

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
      <div className="rounded-lg border bg-white px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Global</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setOverall(n)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  form.ratingOverall === n
                    ? `${RATING_COLORS[n]} text-white scale-110`
                    : n <= form.ratingOverall
                    ? `${RATING_COLORS[n]} text-white opacity-50`
                    : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5">
          {RECOMMENDATIONS.map(rec => (
            <button
              key={rec.value}
              type="button"
              onClick={() => setRecommendation(rec.value)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
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
          Contexto do Jogo (opcional)
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
                className="mt-1 h-10"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Adversário</label>
              <Input
                value={form.opponent}
                onChange={e => setForm(prev => ({ ...prev, opponent: e.target.value }))}
                placeholder="Ex: Leixões S.C."
                className="mt-1 h-10"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data do jogo</label>
              <Input
                type="date"
                value={form.matchDate}
                onChange={e => setForm(prev => ({ ...prev, matchDate: e.target.value }))}
                className="mt-1 h-10"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-lg border bg-white p-4">
        <label className="text-sm font-semibold">Notas (opcional)</label>
        <Textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Observações adicionais sobre o jogador..."
          className="mt-2 resize-none"
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

  return (
    <div className="rounded-lg border bg-white px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span>{dimension.emoji}</span>
          <span className="text-xs font-semibold">{dimension.label}</span>
        </div>
        {/* Compact rating circles inline with label */}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onRate(n)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                rating === n
                  ? `${RATING_COLORS[n]} text-white scale-110`
                  : n <= rating
                  ? `${RATING_COLORS[n]} text-white opacity-50`
                  : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Tags — wrap instead of scroll to prevent overflow */}
      <div className="flex flex-wrap gap-1">
        {tags.map(tag => {
          const selected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                selected
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Rating Circles (1-5) ───────────── */

const RATING_COLORS = [
  '', // 0 — unused
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-blue-500',
  'bg-green-500',
];

function RatingCircles({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-3">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold transition-all ${
            value === n
              ? `${RATING_COLORS[n]} text-white scale-110 ring-2 ring-offset-1 ring-neutral-300`
              : value > 0 && n <= value
              ? `${RATING_COLORS[n]} text-white opacity-60`
              : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
