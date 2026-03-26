// src/components/feedback/CoachFeedbackForm.tsx
// Client-side form for external coach feedback — no auth, submits via public API
// Mobile-first, same visual language as internal TrainingFeedback form
// RELEVANT FILES: src/app/api/feedback/[token]/route.ts, src/app/feedback/[token]/page.tsx, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { Check, Loader2, Star } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  COACH_DECISIONS,
  HEIGHT_SCALE_OPTIONS,
  BUILD_SCALE_OPTIONS,
  SPEED_SCALE_OPTIONS,
  INTENSITY_SCALE_OPTIONS,
  MATURATION_SCALE_OPTIONS,
  TRAINING_TAG_CATEGORIES,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

/* ───────────── Types ───────────── */

interface CoachFeedbackFormProps {
  token: string;
}

/* ───────────── Component ───────────── */

export function CoachFeedbackForm({ token }: CoachFeedbackFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Required fields
  const [ratingPerformance, setRatingPerformance] = useState<number | null>(null);
  const [ratingPotential, setRatingPotential] = useState<number | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  // Optional fields
  const [heightScale, setHeightScale] = useState<string | null>(null);
  const [buildScale, setBuildScale] = useState<string | null>(null);
  const [speedScale, setSpeedScale] = useState<string | null>(null);
  const [intensityScale, setIntensityScale] = useState<string | null>(null);
  const [maturation, setMaturation] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [coachName, setCoachName] = useState('');

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  const canSubmit = ratingPerformance !== null && ratingPotential !== null && decision !== null && feedback.trim().length > 0 && coachName.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratingPerformance,
          ratingPotential,
          decision,
          feedback: feedback.trim(),
          heightScale,
          buildScale,
          speedScale,
          intensityScale,
          maturation,
          tags,
          coachName: coachName.trim(),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Erro ao submeter feedback');
      }
    } catch {
      setError('Erro de ligação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // Success state
  if (submitted) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Check className="h-6 w-6 text-green-600" />
        </div>
        <p className="mt-3 text-sm font-semibold text-neutral-700">Obrigado!</p>
        <p className="mt-1 text-xs text-neutral-500">O feedback foi registado com sucesso.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Dual Rating (required) ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel required>Rendimento</SectionLabel>
          <RatingBarCoach rating={ratingPerformance} onChange={setRatingPerformance} />
        </div>
        <div>
          <SectionLabel required>Potencial</SectionLabel>
          <RatingBarCoach rating={ratingPotential} onChange={setRatingPotential} />
        </div>
      </div>

      {/* ── Decision (required) ── */}
      <div>
        <SectionLabel required>Decisão</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {COACH_DECISIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDecision(decision === opt.value ? null : opt.value)}
              className={cn(
                'rounded-xl border py-2.5 text-sm font-semibold transition text-center',
                decision === opt.value
                  ? opt.colorActive
                  : opt.color,
              )}
            >
              {decision === opt.value && <span className="mr-1">{opt.icon}</span>}
              {opt.labelPt}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feedback text (required) ── */}
      <div>
        <SectionLabel required>Feedback</SectionLabel>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Como correu o treino do jogador..."
          rows={4}
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300"
        />
      </div>

      {/* ── Physical scales (optional) ── */}
      <div className="rounded-xl border border-l-[3px] border-l-neutral-400 bg-neutral-50/50 p-3 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Físico <span className="font-normal text-neutral-400">(opcional)</span></p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ScaleRow label="Estatura" options={HEIGHT_SCALE_OPTIONS} value={heightScale} onChange={setHeightScale} info="Alto = acima da média · Normal = na média · Baixo = abaixo" />
          <ScaleRow label="Corpo" options={BUILD_SCALE_OPTIONS} value={buildScale} onChange={setBuildScale} info="Ecto = magro/longilíneo · Meso = atlético · Endo = robusto" />
          <ScaleRow label="Velocidade" options={SPEED_SCALE_OPTIONS} value={speedScale} onChange={setSpeedScale} info="Rápido = destaca-se · Normal = na média · Lento = abaixo" />
          <ScaleRow label="Intensidade" options={INTENSITY_SCALE_OPTIONS} value={intensityScale} onChange={setIntensityScale} info="Intenso = esforço máximo · Pouco = baixa energia" />
          <ScaleRow label="Maturação" options={MATURATION_SCALE_OPTIONS} value={maturation} onChange={setMaturation} info="Nada = pré-pubertário · Início = início do pico · Maturado = pico atingido · Super = muito avançado" />
        </div>
      </div>

      {/* ── Tags (optional) ── */}
      {TRAINING_TAG_CATEGORIES.map((cat) => {
        const catStyle = cat.category === 'tecnica' ? { border: 'border-l-blue-400', label: 'text-blue-600', emoji: '⚽' }
          : cat.category === 'tatico' ? { border: 'border-l-teal-400', label: 'text-teal-600', emoji: '🧩' }
          : cat.category === 'mental' ? { border: 'border-l-purple-400', label: 'text-purple-600', emoji: '🧠' }
          : { border: 'border-l-amber-400', label: 'text-amber-600', emoji: '🔄' };
        return (
          <div key={cat.category} className={cn('rounded-xl border border-l-[3px] bg-neutral-50/50 p-3', catStyle.border)}>
            <p className={cn('mb-2 text-[11px] font-bold uppercase tracking-widest', catStyle.label)}>{catStyle.emoji} {cat.labelPt} <span className="font-normal text-neutral-400">(opcional)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {cat.tags.map((tag) => {
                const selected = tags.includes(tag.value);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => toggleTag(tag.value)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition',
                      selected
                        ? 'bg-blue-100 text-blue-700 border border-blue-300 shadow-sm'
                        : 'border border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400',
                    )}
                  >
                    {tag.labelPt}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Coach name (optional) ── */}
      <div>
        <SectionLabel required>O seu nome</SectionLabel>
        <input
          value={coachName}
          onChange={(e) => setCoachName(e.target.value)}
          placeholder="Ex: Mister João"
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300"
        />
      </div>

      {/* ── Error ── */}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
      )}

      {/* ── Submit ── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> A enviar...</> : 'Enviar Feedback'}
      </button>

      {!canSubmit && (
        <p className="text-center text-[10px] text-neutral-400">
          Preencha o nome, avaliações, decisão e feedback para submeter.
        </p>
      )}
    </div>
  );
}

/* ───────────── Scale Row ───────────── */

function ScaleRow({ label, options, value, onChange, info }: {
  label: string;
  options: { value: string; labelPt: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  info?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <p className="text-[10px] font-medium text-neutral-500">{label}</p>
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-bold text-neutral-500 hover:bg-neutral-300"
              >
                i
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-52 rounded-lg border-neutral-200 bg-neutral-900 p-2.5 text-[11px] leading-relaxed text-neutral-200 shadow-lg">
              {info.split(' · ').map((item) => (
                <p key={item} className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
                  {item}
                </p>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="flex h-8 gap-0.5 rounded-lg overflow-hidden">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={cn(
              'flex-1 flex items-center justify-center text-xs font-semibold transition-all active:scale-95',
              value === opt.value ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200',
              i === 0 && 'rounded-l-lg',
              i === options.length - 1 && 'rounded-r-lg',
            )}
          >
            {opt.labelPt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Section Label ───────────── */

function SectionLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
      {children}
      {required && <span className="ml-1 text-red-400">*</span>}
    </p>
  );
}

/* ───────────── Rating Colors ───────────── */

const RATING_COLORS: Record<number, { star: string; text: string; bg: string }> = {
  1: { star: 'text-red-500', text: 'text-red-600', bg: 'bg-red-50' },
  2: { star: 'text-orange-400', text: 'text-orange-600', bg: 'bg-orange-50' },
  3: { star: 'text-blue-400', text: 'text-blue-600', bg: 'bg-blue-50' },
  4: { star: 'text-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  5: { star: 'text-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};
const DEFAULT_COLORS = { star: 'text-neutral-300', text: 'text-neutral-500', bg: 'bg-neutral-50' };

const RATING_LABELS: Record<number, string> = {
  1: 'Fraco', 2: 'Dúvida', 3: 'Bom', 4: 'Muito Bom', 5: 'Excelente',
};

/* ───────────── Rating Bar (segmented 1-5) ───────────── */

function RatingBarCoach({ rating, onChange }: { rating: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className="flex h-10 gap-0.5 rounded-xl overflow-hidden">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = rating !== null && n <= rating;
          const c = RATING_COLORS[rating ?? 0] ?? DEFAULT_COLORS;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(rating === n ? null : n)}
              className={cn(
                'flex-1 flex items-center justify-center text-xs font-bold transition-all active:scale-95',
                active ? `${c.bg} ${c.text}` : 'bg-neutral-100 text-neutral-300 hover:bg-neutral-200',
                n === 1 && 'rounded-l-xl',
                n === 5 && 'rounded-r-xl',
              )}
            >
              <Star className={cn('h-4 w-4', active ? c.star : 'text-neutral-300')} fill={active ? 'currentColor' : 'none'} strokeWidth={1.5} />
            </button>
          );
        })}
      </div>
      {rating && (
        <p className={cn('mt-1 text-center text-xs font-bold', (RATING_COLORS[rating] ?? DEFAULT_COLORS).text)}>
          {RATING_LABELS[rating]}
        </p>
      )}
    </div>
  );
}
