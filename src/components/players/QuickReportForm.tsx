// src/components/players/QuickReportForm.tsx
// Mobile-first tap-based quick evaluation form for player scouting
// Large touch targets (48px), horizontal tag chips, sticky submit
// RELEVANT FILES: src/actions/quick-scout-reports.ts, src/lib/constants/quick-report-tags.ts

'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { ChevronDown, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { submitQuickReport } from '@/actions/quick-scout-reports';
import { DIMENSIONS, RECOMMENDATIONS, getTagsForDimension, type DimensionKey, type Tag } from '@/lib/constants/quick-report-tags';
import { POSITIONS } from '@/lib/constants';
import type { QuickReportRecommendation, QuickReportMaturation, QuickReportFoot, QuickReportStandout, QuickReportStarter, QuickReportOpponentLevel, HeightScale, BuildScale, SpeedScale, IntensityScale, MaturationScale } from '@/lib/types';

/* ───────────── Types ───────────── */

interface QuickReportFormProps {
  playerId: number;
  playerName: string;
  isGoalkeeper: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  /** Called when form dirty state changes (has any data filled) */
  onDirtyChange?: (dirty: boolean) => void;
  /** Pre-fill match context from scouting assignment */
  initialMatchContext?: {
    competition?: string;
    opponent?: string;
    matchDate?: string;
    gameId?: number;
  };
}

interface FormState {
  ratings: Record<DimensionKey, number>;
  tags: Record<DimensionKey, string[]>;
  ratingOverall: number;
  recommendation: QuickReportRecommendation | '';
  maturation: QuickReportMaturation | '';
  observedFoot: QuickReportFoot | '';
  heightScale: HeightScale | '';
  buildScale: BuildScale | '';
  speedScale: SpeedScale | '';
  intensityScale: IntensityScale | '';
  maturationScale: MaturationScale | '';
  opponentLevel: QuickReportOpponentLevel | '';
  observedPosition: string;
  minutesObserved: string;
  standoutLevel: QuickReportStandout | '';
  starter: QuickReportStarter | '';
  subMinute: string;
  conditions: string[];
  competition: string;
  opponent: string;
  matchDate: string;
  notes: string;
}

const FOOT_OPTIONS: { value: QuickReportFoot; label: string; emoji: string }[] = [
  { value: 'Direito', label: 'Dir', emoji: '🦶' },
  { value: 'Esquerdo', label: 'Esq', emoji: '🦶' },
  { value: 'Ambos', label: 'Ambos', emoji: '🦶🦶' },
];

const STANDOUT_OPTIONS: { value: QuickReportStandout; label: string; color: string }[] = [
  { value: 'Acima', label: '↑ Acima', color: 'bg-green-600 text-white' },
  { value: 'Ao nível', label: '→ Ao nível', color: 'bg-sky-600 text-white' },
  { value: 'Abaixo', label: '↓ Abaixo', color: 'bg-red-500 text-white' },
];

const STARTER_OPTIONS: { value: QuickReportStarter; label: string }[] = [
  { value: 'Titular', label: 'Titular' },
  { value: 'Suplente', label: 'Suplente' },
];

// HEIGHT_OPTIONS + BUILD_OPTIONS removed — replaced by physical scale selectors matching training feedback

const OPPONENT_LEVEL_OPTIONS: { value: QuickReportOpponentLevel; label: string; color: string }[] = [
  { value: 'Forte', label: '💪 Forte', color: 'bg-red-500 text-white' },
  { value: 'Médio', label: '⚖️ Médio', color: 'bg-sky-600 text-white' },
  { value: 'Fraco', label: '👎 Fraco', color: 'bg-neutral-500 text-white' },
];

/** Observed positions — DC split into DC(E) and DC(D) for match context */
const OBSERVED_POSITIONS: { code: string; label: string }[] = POSITIONS
  .flatMap(p => p.code === 'DC'
    ? [{ code: 'DC(E)', label: 'Central (E)' }, { code: 'DC(D)', label: 'Central (D)' }]
    : [{ code: p.code, label: p.labelPt }],
  );

/** Condition tags — weather + pitch state */
const CONDITION_TAGS = [
  '☀️ Calor', '🥶 Frio', '🌧️ Chuva', '💨 Vento',
  '💦 Campo alagado', '🌙 Noite', '🏟️ Sintético', '🌿 Relva',
];

const EMPTY_STATE: FormState = {
  ratings: { tecnica: 0, tatica: 0, fisico: 0, mentalidade: 0, potencial: 0 },
  tags: { tecnica: [], tatica: [], fisico: [], mentalidade: [], potencial: [] },
  ratingOverall: 0,
  recommendation: '',
  maturation: '',
  observedFoot: '',
  heightScale: '',
  buildScale: '',
  speedScale: '',
  intensityScale: '',
  maturationScale: '',
  opponentLevel: '',
  observedPosition: '',
  minutesObserved: '',
  standoutLevel: '',
  starter: '',
  subMinute: '',
  conditions: [],
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
    || form.maturation !== ''
    || form.observedFoot !== ''
    || form.heightScale !== ''
    || form.buildScale !== ''
    || form.speedScale !== ''
    || form.intensityScale !== ''
    || form.maturationScale !== ''
    || form.opponentLevel !== ''
    || form.observedPosition !== ''
    || form.minutesObserved !== ''
    || form.standoutLevel !== ''
    || form.starter !== ''
    || form.conditions.length > 0
    || form.competition !== ''
    || form.opponent !== ''
    || form.matchDate !== ''
    || form.notes !== '';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- playerName kept for future use
export function QuickReportForm({ playerId, playerName, isGoalkeeper, onSuccess, onCancel, onDirtyChange, initialMatchContext }: QuickReportFormProps) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initialMatchContext) return EMPTY_STATE;
    return {
      ...EMPTY_STATE,
      competition: initialMatchContext.competition ?? '',
      opponent: initialMatchContext.opponent ?? '',
      matchDate: initialMatchContext.matchDate ?? '',
    };
  });
  // showRec kept for expand-on-rate behavior (recommendation always visible now)
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
        maturation: form.maturation || undefined,
        observedFoot: form.observedFoot || undefined,
        heightScale: form.heightScale || undefined,
        buildScale: form.buildScale || undefined,
        speedScale: form.speedScale || undefined,
        intensityScale: form.intensityScale || undefined,
        maturationScale: form.maturationScale || undefined,
        opponentLevel: form.opponentLevel || undefined,
        observedPosition: form.observedPosition || undefined,
        minutesObserved: form.minutesObserved ? parseInt(form.minutesObserved, 10) : undefined,
        standoutLevel: form.standoutLevel || undefined,
        starter: form.starter || undefined,
        subMinute: form.subMinute ? parseInt(form.subMinute, 10) : undefined,
        conditions: form.conditions,
        competition: form.competition || undefined,
        opponent: form.opponent || undefined,
        matchDate: form.matchDate || undefined,
        notes: form.notes || undefined,
        gameId: initialMatchContext?.gameId ?? undefined,
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
    <div className="space-y-4 overflow-hidden">

      {/* ── Posição Observada ── */}
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Posição observada</p>
        <div className="flex flex-wrap gap-1.5">
          {OBSERVED_POSITIONS.map(pos => (
            <button
              key={pos.code}
              type="button"
              onClick={() => setForm(prev => ({ ...prev, observedPosition: prev.observedPosition === pos.code ? '' : pos.code }))}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                form.observedPosition === pos.code
                  ? 'bg-neutral-800 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
              )}
              title={pos.label}
            >
              {pos.code}
            </button>
          ))}
        </div>
      </div>

      {/* ── Dimension cards ── */}
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

      {/* ── Global + Recomendação ── */}
      <div className="rounded-xl border border-l-[3px] border-l-amber-400 bg-neutral-50/50 p-3 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">⭐ Avaliação Global</p>
        <div className="flex h-10 gap-0.5 rounded-xl overflow-hidden">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => { const newVal = form.ratingOverall === n ? 0 : n; setOverall(newVal); }}
              className={cn(
                'flex-1 flex items-center justify-center text-xs font-bold transition-all active:scale-95',
                n <= form.ratingOverall ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200',
                n === 1 && 'rounded-l-xl',
                n === 5 && 'rounded-r-xl',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Recomendação</p>
          <div className="flex gap-2">
            {RECOMMENDATIONS.map(rec => (
              <button
                key={rec.value}
                type="button"
                onClick={() => setRecommendation(rec.value)}
                className={cn(
                  'flex-1 rounded-xl border py-2.5 text-xs font-semibold transition text-center',
                  form.recommendation === rec.value
                    ? rec.color + ' shadow-sm'
                    : 'border-neutral-200 text-neutral-400 hover:border-neutral-400',
                )}
              >
                {rec.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Físico (same layout as training feedback) ── */}
      <div className="rounded-xl border border-l-[3px] border-l-cyan-400 bg-neutral-50/50 p-3 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-600">⚡ Físico</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ScaleSelector label="Estatura" options={[{ value: 'alto', label: 'Alto' }, { value: 'normal', label: 'Normal' }, { value: 'baixo', label: 'Baixo' }]}
            value={form.heightScale} onChange={(v) => setForm(prev => ({ ...prev, heightScale: prev.heightScale === v ? '' : v as HeightScale }))} />
          <ScaleSelector label="Corpo" options={[{ value: 'ectomorfo', label: 'Ecto' }, { value: 'mesomorfo', label: 'Meso' }, { value: 'endomorfo', label: 'Endo' }]}
            value={form.buildScale} onChange={(v) => setForm(prev => ({ ...prev, buildScale: prev.buildScale === v ? '' : v as BuildScale }))} />
          <ScaleSelector label="Velocidade" options={[{ value: 'rapido', label: 'Rápido' }, { value: 'normal', label: 'Normal' }, { value: 'lento', label: 'Lento' }]}
            value={form.speedScale} onChange={(v) => setForm(prev => ({ ...prev, speedScale: prev.speedScale === v ? '' : v as SpeedScale }))} />
          <ScaleSelector label="Intensidade" options={[{ value: 'intenso', label: 'Intenso' }, { value: 'pouco_intenso', label: 'Pouco intenso' }]}
            value={form.intensityScale} onChange={(v) => setForm(prev => ({ ...prev, intensityScale: prev.intensityScale === v ? '' : v as IntensityScale }))} />
        </div>
        <ScaleSelector label="Maturação" options={[{ value: 'nada_maturado', label: 'Nada' }, { value: 'a_iniciar', label: 'Início' }, { value: 'maturado', label: 'Maturado' }, { value: 'super_maturado', label: 'Super' }]}
          value={form.maturationScale} onChange={(v) => setForm(prev => ({ ...prev, maturationScale: prev.maturationScale === v ? '' : v as MaturationScale }))} />
      </div>

      {/* ── Contexto da Observação ── */}
      <div className="rounded-xl border border-l-[3px] border-l-purple-400 bg-neutral-50/50 p-3 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-purple-600">👁️ Contexto</p>

        {/* Pé + Destaque + Adversário */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold text-neutral-500">Pé</p>
            <div className="flex flex-col gap-1">
              {FOOT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setForm(prev => ({ ...prev, observedFoot: prev.observedFoot === opt.value ? '' : opt.value }))}
                  className={cn('rounded-lg py-1.5 text-[11px] font-semibold transition', form.observedFoot === opt.value ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200')}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold text-neutral-500">Destaque</p>
            <div className="flex flex-col gap-1">
              {STANDOUT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setForm(prev => ({ ...prev, standoutLevel: prev.standoutLevel === opt.value ? '' : opt.value }))}
                  className={cn('rounded-lg py-1.5 text-[11px] font-semibold transition', form.standoutLevel === opt.value ? opt.color : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200')}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold text-neutral-500">Adversário</p>
            <div className="flex flex-col gap-1">
              {OPPONENT_LEVEL_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setForm(prev => ({ ...prev, opponentLevel: prev.opponentLevel === opt.value ? '' : opt.value }))}
                  className={cn('rounded-lg py-1.5 text-[11px] font-semibold transition', form.opponentLevel === opt.value ? opt.color : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200')}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Titular/Suplente + Minutos */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold text-neutral-500">Titular / Suplente</p>
            <div className="flex gap-1.5">
              {STARTER_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(prev => ({ ...prev, starter: prev.starter === opt.value ? '' : opt.value, subMinute: (prev.starter === opt.value || opt.value === 'Titular') ? '' : prev.subMinute }))}
                  className={cn('flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition', form.starter === opt.value ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200')}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold text-neutral-500">
              {form.starter === 'Suplente' ? 'Min. entrada' : 'Min. observados'}
            </p>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={form.starter === 'Suplente' ? form.subMinute : form.minutesObserved}
              onChange={e => setForm(prev => form.starter === 'Suplente'
                ? { ...prev, subMinute: e.target.value }
                : { ...prev, minutesObserved: e.target.value }
              )}
              placeholder={form.starter === 'Suplente' ? 'Min' : 'Ex: 70'}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Condições */}
        <div>
          <p className="mb-1 text-[10px] font-semibold text-neutral-500">Condições</p>
          <div className="flex flex-wrap gap-1">
            {CONDITION_TAGS.map(tag => {
              const selected = form.conditions.includes(tag);
              return (
                <button key={tag} type="button"
                  onClick={() => setForm(prev => ({ ...prev, conditions: selected ? prev.conditions.filter(c => c !== tag) : [...prev.conditions, tag] }))}
                  className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition', selected ? 'border-neutral-700 bg-neutral-800 text-white' : 'border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100')}>
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Contexto do Jogo (open, pre-filled if from game) ── */}
      <div className="rounded-xl border bg-neutral-50/50 p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Contexto do Jogo</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-neutral-500">Competição</label>
            <Input value={form.competition} onChange={e => setForm(prev => ({ ...prev, competition: e.target.value }))} placeholder="Campeonato Distrital" className="mt-0.5 h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500">Data</label>
            <Input type="date" value={form.matchDate} onChange={e => setForm(prev => ({ ...prev, matchDate: e.target.value }))} className="mt-0.5 h-8 text-xs" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-neutral-500">Jogo</label>
          <Input value={form.opponent} onChange={e => setForm(prev => ({ ...prev, opponent: e.target.value }))} placeholder="Equipa A vs Equipa B" className="mt-0.5 h-8 text-xs" />
        </div>
      </div>

      {/* ── Notas ── */}
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Notas</p>
        <Textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Observações adicionais..."
          className="resize-none text-xs placeholder:text-muted-foreground/40"
          rows={3}
        />
      </div>

      {/* ── Submit ── */}
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

/* ───────────── Scale Selector (matches training feedback ScaleBlock) ───────────── */

function ScaleSelector({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold text-neutral-500">{label}</p>
      <div className="flex gap-1">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition',
              value === opt.value
                ? 'bg-neutral-800 text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
            )}
          >
            {opt.label}
          </button>
        ))}
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
    <div className={cn(
      'rounded-xl border bg-white border-l-[3px] overflow-hidden',
      dimension.borderColor,
    )}>
      {/* Compact single-row: emoji + label + bar + score */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm shrink-0">{dimension.emoji}</span>
        <span className="w-[84px] shrink-0 text-left text-xs font-semibold truncate">{dimension.label}</span>

        {/* Segmented rating bar — integer 1-5, tap to toggle */}
        <div className="flex h-9 flex-1 gap-0.5 rounded-lg overflow-hidden">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => { const newVal = rating === n ? 0 : n; onRate(newVal); }}
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

        {/* Score */}
        <span className={cn(
          'text-base font-black tabular-nums w-5 text-right shrink-0',
          rating > 0 ? dimension.textColor : 'text-neutral-300',
        )}>
          {rating > 0 ? rating : '—'}
        </span>
      </div>

      {/* Tags — always visible */}
      <TagsSection
        tags={tags}
        selectedTags={selectedTags}
        onToggleTag={onToggleTag}
      />
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
            onKeyDown={e => { if (e.key === 'Escape') { setShowInput(false); setCustomTag(''); } }}
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

/** Segmented bar with half-value support (0.5 increments, color-coded)
 * Tap left half of segment = N-0.5, right half = N.0. Tap same value = deselect.
 * Fill: full segments colored, half segments show left-half gradient. */
export function HalfStarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hoverValue, setHoverValue] = useState(0);
  const displayValue = hoverValue || value;

  function handleClick(clickValue: number) {
    onChange(value === clickValue ? 0 : clickValue);
  }

  /** Background color for filled/half segments */
  const BG_COLORS: Record<number, string> = {
    1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-sky-500', 4: 'bg-teal-500', 5: 'bg-green-500',
  };
  const colorKey = Math.ceil(displayValue) || 1;
  const fillColor = BG_COLORS[colorKey] ?? 'bg-red-500';

  return (
    <div className="flex h-9 flex-1 gap-0.5 rounded-lg overflow-hidden" onMouseLeave={() => setHoverValue(0)}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = displayValue >= n;
        const halfFilled = !filled && displayValue >= n - 0.5;
        const empty = !filled && !halfFilled;

        return (
          <div
            key={n}
            className={cn(
              'relative flex-1 flex items-center justify-center text-xs font-bold transition-all overflow-hidden',
              filled && `${fillColor} text-white`,
              empty && 'bg-neutral-100 text-neutral-400',
              n === 1 && 'rounded-l-lg',
              n === 5 && 'rounded-r-lg',
            )}
          >
            {/* Half-filled: left half colored, right half neutral */}
            {halfFilled && (
              <>
                <div className={cn('absolute inset-y-0 left-0 w-1/2', fillColor)} />
                <div className="absolute inset-y-0 right-0 w-1/2 bg-neutral-100" />
              </>
            )}
            <span className={cn('relative z-10', halfFilled && 'text-neutral-500')}>{n}</span>

            {/* Touch zones — left = N-0.5, right = N.0 */}
            <button
              type="button"
              onClick={() => handleClick(n - 0.5)}
              onMouseEnter={() => setHoverValue(n - 0.5)}
              className="absolute left-0 top-0 h-full w-1/2 z-20"
              aria-label={`${n - 0.5} estrelas`}
            />
            <button
              type="button"
              onClick={() => handleClick(n)}
              onMouseEnter={() => setHoverValue(n)}
              className="absolute right-0 top-0 h-full w-1/2 z-20"
              aria-label={`${n} estrelas`}
            />
          </div>
        );
      })}
    </div>
  );
}
