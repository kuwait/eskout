// src/components/players/TrainingFeedback.tsx
// Training feedback list + inline add form — shows presence, feedback, rating per training session
// Used in the player profile page to track when a player comes to train at the club
// RELEVANT FILES: src/actions/training-feedback.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Calendar, GraduationCap, Plus, Star, Trash2 } from 'lucide-react';
import { TRAINING_PRESENCE } from '@/lib/constants';
import type { TrainingFeedback as TFeedback, TrainingPresence, UserRole } from '@/lib/types';
import { createTrainingFeedback, deleteTrainingFeedback } from '@/actions/training-feedback';
import { cn } from '@/lib/utils';

/* ───────────── Props ───────────── */

interface TrainingFeedbackProps {
  playerId: number;
  entries: TFeedback[];
  userRole: UserRole;
  /** Player's training escalão (pre-fill for new entries) */
  defaultEscalao?: string | null;
  /** Current user's display name for optimistic entries */
  currentUserName?: string | null;
  /** Current user ID — to check ownership for delete */
  currentUserId?: string | null;
}

/* ───────────── Component ───────────── */

export function TrainingFeedbackList({ playerId, entries: initialEntries, userRole, defaultEscalao, currentUserName, currentUserId }: TrainingFeedbackProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canAdd = userRole === 'admin' || userRole === 'editor' || userRole === 'recruiter';

  function handleDelete(feedbackId: number) {
    startTransition(async () => {
      const res = await deleteTrainingFeedback(feedbackId, playerId);
      if (res.success) {
        setEntries((prev) => prev.filter((e) => e.id !== feedbackId));
        toast.success('Feedback eliminado');
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleCreated(entry: TFeedback) {
    setEntries((prev) => [entry, ...prev]);
    setShowForm(false);
  }

  return (
    <div className="space-y-3">
      {/* Add button */}
      {canAdd && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar Feedback de Treino
        </button>
      )}

      {/* Inline form */}
      {showForm && (
        <AddTrainingFeedbackForm
          playerId={playerId}
          defaultEscalao={defaultEscalao}
          currentUserName={currentUserName}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Entry list */}
      {entries.length === 0 && !showForm && (
        <p className="py-2 text-center text-xs text-muted-foreground">Sem feedback de treino registado.</p>
      )}

      {entries.map((entry) => (
        <FeedbackEntry
          key={entry.id}
          entry={entry}
          canDelete={userRole === 'admin' || entry.authorId === currentUserId}
          onDelete={() => handleDelete(entry.id)}
          isPending={isPending}
        />
      ))}
    </div>
  );
}

/* ───────────── Feedback Entry Card ───────────── */

function FeedbackEntry({ entry, canDelete, onDelete, isPending }: {
  entry: TFeedback;
  canDelete: boolean;
  onDelete: () => void;
  isPending: boolean;
}) {
  const presenceConfig = TRAINING_PRESENCE.find((p) => p.value === entry.presence);
  const dateLabel = new Date(entry.trainingDate).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      {/* Header: date + presence badge + delete */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-neutral-600">{dateLabel}</span>
          {entry.escalao && (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700 border border-amber-200">
              {entry.escalao}
            </span>
          )}
          {presenceConfig && (
            <span className={cn('shrink-0 rounded border px-1.5 py-px text-[10px] font-bold', presenceConfig.color)}>
              {presenceConfig.icon} {presenceConfig.labelPt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Rating stars */}
          {entry.rating && (() => {
            const c = RATING_COLORS[entry.rating] ?? DEFAULT_COLORS;
            return (
              <span className={cn('flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold', c.bg, c.text)}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn('h-2.5 w-2.5', i < entry.rating! ? c.star : 'text-neutral-200')} fill="currentColor" strokeWidth={i < entry.rating! ? 1.5 : 0} />
                ))}
                <span className="ml-0.5">{RATING_LABELS[entry.rating]}</span>
              </span>
            );
          })()}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="rounded p-0.5 text-neutral-400 hover:text-red-500 transition disabled:opacity-30"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Feedback text */}
      {entry.feedback && (
        <p className="mt-1.5 text-sm text-neutral-700 leading-snug">{entry.feedback}</p>
      )}

      {/* Author */}
      <p className="mt-1 text-[10px] text-muted-foreground">
        por {entry.authorName}
      </p>
    </div>
  );
}

/* ───────────── Add Form ───────────── */

function AddTrainingFeedbackForm({ playerId, defaultEscalao, currentUserName, onCreated, onCancel }: {
  playerId: number;
  defaultEscalao?: string | null;
  currentUserName?: string | null;
  onCreated: (entry: TFeedback) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [escalao, setEscalao] = useState(defaultEscalao ?? '');
  const [presence, setPresence] = useState<TrainingPresence>('attended');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  function handleSubmit() {
    if (!date) {
      toast.error('Data obrigatória');
      return;
    }

    startTransition(async () => {
      const res = await createTrainingFeedback(
        playerId, date, presence, feedback || undefined, rating ?? undefined, escalao || undefined,
      );

      if (res.success) {
        // Build optimistic entry for instant UI update
        const optimistic: TFeedback = {
          id: Date.now(), // temporary ID, replaced on next server fetch
          clubId: '',
          playerId,
          authorId: '',
          authorName: currentUserName || 'Eu',
          trainingDate: date,
          escalao: escalao || null,
          presence,
          feedback: feedback || null,
          rating,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onCreated(optimistic);
        toast.success('Feedback registado');
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Data + Escalão — side by side */}
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Data do Treino">
          <TrainingDateInput value={date} onChange={setDate} />
        </FieldLabel>
        <FieldLabel label="Escalão">
          <div className="relative flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-2 shadow-sm">
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <input
              value={escalao}
              onChange={(e) => setEscalao(e.target.value)}
              placeholder="Ex: Sub-15"
              className="w-full bg-transparent text-xs font-medium tracking-wide text-neutral-600 placeholder:text-muted-foreground outline-none"
            />
          </div>
        </FieldLabel>
      </div>

      {/* Presença + Avaliação — side by side */}
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Presença">
          <div className="flex gap-1.5">
            {TRAINING_PRESENCE.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPresence(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition',
                  presence === opt.value
                    ? opt.color + ' shadow-sm border'
                    : 'border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-500',
                )}
              >
                {presence === opt.value && <span className="mr-1">{opt.icon}</span>}
                {opt.labelPt}
              </button>
            ))}
          </div>
        </FieldLabel>
        <FieldLabel label="Avaliação">
          <TrainingRatingStars rating={rating} onChange={setRating} />
        </FieldLabel>
      </div>

      {/* Feedback */}
      <FieldLabel label="Feedback">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Como correu o treino..."
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium tracking-wide text-neutral-600 placeholder:font-normal placeholder:tracking-wide placeholder:text-neutral-400 outline-none"
        />
      </FieldLabel>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:border-neutral-400 hover:text-neutral-500 transition"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !date}
          className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400"
        >
          {isPending ? 'A guardar...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

/* ───────────── Date Input (mirrors DateInput from PlayerProfile) ───────────── */

function TrainingDateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value
    ? new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  return (
    <div
      className="relative flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2.5 py-2 shadow-sm transition-colors hover:bg-accent"
      onClick={() => ref.current?.showPicker?.()}
    >
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <Calendar className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
      <span className={value ? 'text-xs font-medium tracking-wide text-neutral-600' : 'text-xs text-muted-foreground'}>
        {display}
      </span>
    </div>
  );
}

/* ───────────── Rating Colors & Labels (same as ScoutEvaluations) ───────────── */

const RATING_COLORS: Record<number, { star: string; text: string; bg: string }> = {
  1: { star: 'text-red-500', text: 'text-red-600', bg: 'bg-red-50' },
  2: { star: 'text-orange-400', text: 'text-orange-600', bg: 'bg-orange-50' },
  3: { star: 'text-blue-400', text: 'text-blue-600', bg: 'bg-blue-50' },
  4: { star: 'text-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  5: { star: 'text-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};
const DEFAULT_COLORS = { star: 'text-neutral-300', text: 'text-neutral-500', bg: 'bg-neutral-50' };

const RATING_LABELS: Record<number, string> = {
  1: 'Fraco',
  2: 'Dúvida',
  3: 'Bom',
  4: 'Muito Bom',
  5: 'Excelente',
};

/* ───────────── Interactive Rating Stars ───────────── */

function TrainingRatingStars({ rating, onChange }: { rating: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState(0);
  const active = hover || rating || 0;
  const colors = RATING_COLORS[active] ?? DEFAULT_COLORS;

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 shadow-sm">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = hover > 0 ? n <= hover : (rating ? n <= rating : false);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(rating === n ? null : n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5 transition-transform hover:scale-125"
              title={RATING_LABELS[n]}
            >
              <Star
                className={cn('h-5 w-5', filled ? colors.star : 'text-neutral-200')}
                fill={filled ? 'currentColor' : 'none'}
                strokeWidth={1.5}
              />
            </button>
          );
        })}
      </div>
      {rating && (() => {
        const c = RATING_COLORS[rating] ?? DEFAULT_COLORS;
        return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.bg, c.text)}>{RATING_LABELS[rating]}</span>;
      })()}
      {!rating && hover > 0 && (
        <span className={cn('text-[10px] font-medium', colors.text)}>{RATING_LABELS[hover]}</span>
      )}
      {!rating && hover === 0 && (
        <span className="shrink-0 text-[10px] text-muted-foreground/60">Opcional</span>
      )}
    </div>
  );
}

/* ───────────── Field Label (mirrors EditField from PlayerProfile) ───────────── */

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
