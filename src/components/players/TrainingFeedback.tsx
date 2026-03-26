// src/components/players/TrainingFeedback.tsx
// Training feedback list + dialog form — presence, rating, decision, physical scales, tags, text
// Used in the player profile page to track when a player comes to train at the club
// RELEVANT FILES: src/actions/training-feedback.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Calendar, Check, ChevronDown, GraduationCap, Loader2, Plus, Share2, Star, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TRAINING_PRESENCE,
  TRAINING_DECISIONS,
  COACH_DECISIONS,
  HEIGHT_SCALE_OPTIONS,
  BUILD_SCALE_OPTIONS,
  SPEED_SCALE_OPTIONS,
  INTENSITY_SCALE_OPTIONS,
  TRAINING_TAG_CATEGORIES,
  TRAINING_TAG_LABEL_MAP,
} from '@/lib/constants';
import type {
  BuildScale,
  HeightScale,
  IntensityScale,
  SpeedScale,
  TrainingDecision,
  TrainingFeedback as TFeedback,
  TrainingPresence,
  UserRole,
} from '@/lib/types';
import { createTrainingFeedback, deleteTrainingFeedback, createCoachFeedbackLink } from '@/actions/training-feedback';
import { cn } from '@/lib/utils';

/* ───────────── Props ───────────── */

interface TrainingFeedbackProps {
  playerId: number;
  entries: TFeedback[];
  userRole: UserRole;
  defaultEscalao?: string | null;
  currentUserName?: string | null;
  currentUserId?: string | null;
}

/* ───────────── Main List Component ───────────── */

export function TrainingFeedbackList({ playerId, entries: initialEntries, userRole, defaultEscalao, currentUserName, currentUserId }: TrainingFeedbackProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [coachDialogOpen, setCoachDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canAdd = userRole === 'admin' || userRole === 'editor' || userRole === 'recruiter';

  // Summary
  const attended = entries.filter((e) => e.presence === 'attended');
  const latest = attended[0];
  const summaryParts: string[] = [];
  if (attended.length > 0) summaryParts.push(`${attended.length} treino${attended.length > 1 ? 's' : ''}`);
  if (latest?.rating) summaryParts.push(`${'★'.repeat(latest.rating)}${'☆'.repeat(5 - latest.rating)} ${RATING_LABELS[latest.rating]}`);
  if (latest?.decision && latest.decision !== 'sem_decisao') {
    const dc = TRAINING_DECISIONS.find((d) => d.value === latest.decision);
    if (dc) summaryParts.push(dc.labelPt);
  }

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
    setDialogOpen(false);
  }

  return (
    <div className="space-y-3">
      {summaryParts.length > 0 && (
        <p className="text-xs text-muted-foreground">{summaryParts.join(' · ')}</p>
      )}

      {canAdd && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Feedback
          </button>
          <button
            type="button"
            onClick={() => setCoachDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-cyan-300 px-3 py-2 text-xs font-medium text-cyan-600 transition hover:border-cyan-400 hover:bg-cyan-50"
          >
            <Share2 className="h-3.5 w-3.5" />
            Pedir a treinador
          </button>
        </div>
      )}

      {/* Internal feedback dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Feedback de Treino</DialogTitle>
          </DialogHeader>
          <AddTrainingFeedbackForm
            playerId={playerId}
            defaultEscalao={defaultEscalao}
            currentUserName={currentUserName}
            onCreated={handleCreated}
          />
        </DialogContent>
      </Dialog>

      {/* Coach feedback link dialog */}
      <Dialog open={coachDialogOpen} onOpenChange={setCoachDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pedir feedback ao treinador</DialogTitle>
          </DialogHeader>
          <CoachLinkForm
            playerId={playerId}
            defaultEscalao={defaultEscalao}
            onCreated={(entry) => {
              setEntries((prev) => [entry, ...prev]);
              setCoachDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {entries.length === 0 && (
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const presenceConfig = TRAINING_PRESENCE.find((p) => p.value === entry.presence);
  const decisionConfig = TRAINING_DECISIONS.find((d) => d.value === entry.decision);
  const dateLabel = new Date(entry.trainingDate).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  // Physical: category + value pairs for readable display
  const physicalPairs: { category: string; label: string }[] = [];
  if (entry.heightScale) { const o = HEIGHT_SCALE_OPTIONS.find((x) => x.value === entry.heightScale); if (o) physicalPairs.push({ category: 'Estatura', label: o.labelPt }); }
  if (entry.buildScale) { const o = BUILD_SCALE_OPTIONS.find((x) => x.value === entry.buildScale); if (o) physicalPairs.push({ category: 'Corpo', label: o.labelPt }); }
  if (entry.speedScale) { const o = SPEED_SCALE_OPTIONS.find((x) => x.value === entry.speedScale); if (o) physicalPairs.push({ category: 'Velocidade', label: o.labelPt }); }
  if (entry.intensityScale) { const o = INTENSITY_SCALE_OPTIONS.find((x) => x.value === entry.intensityScale); if (o) physicalPairs.push({ category: 'Intensidade', label: o.labelPt }); }

  // Tags: resolve category for coloring
  const tagsByCategory = entry.tags.map((tag) => {
    const cat = TRAINING_TAG_CATEGORIES.find((c) => c.tags.some((t) => t.value === tag));
    return { value: tag, label: TRAINING_TAG_LABEL_MAP[tag] ?? tag, category: cat?.category ?? '' };
  });

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-neutral-600">{dateLabel}</span>
          {entry.escalao && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
              {entry.escalao}
            </span>
          )}
          {presenceConfig && (
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold', presenceConfig.color)}>
              {presenceConfig.icon} {presenceConfig.labelPt}
            </span>
          )}
          {decisionConfig && entry.decision !== 'sem_decisao' && (
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold', decisionConfig.color)}>
              {decisionConfig.icon} {decisionConfig.labelPt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
            confirmDelete ? (
              <button
                type="button"
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                disabled={isPending}
                onBlur={() => setConfirmDelete(false)}
                className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-red-600 disabled:opacity-30"
              >
                Confirmar
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={isPending} className="rounded p-0.5 text-neutral-400 hover:text-red-500 transition disabled:opacity-30" title="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Physical (compact single line) + tags (colored pills) */}
      {(physicalPairs.length > 0 || tagsByCategory.length > 0) && (
        <div className="mt-2 space-y-1.5">
          {physicalPairs.length > 0 && (
            <p className="text-[11px] text-neutral-500">
              {physicalPairs.map((p, i) => (
                <span key={p.category}>
                  {i > 0 && <span className="mx-1 text-neutral-300">·</span>}
                  <span className="text-neutral-400">{p.category}</span>{' '}
                  <span className="font-semibold text-neutral-700">{p.label}</span>
                </span>
              ))}
            </p>
          )}
          {tagsByCategory.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tagsByCategory.map((t) => {
                const colorClass = t.category === 'tecnica' ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : t.category === 'mental' ? 'bg-purple-100 text-purple-700 border-purple-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200';
                return (
                  <span key={t.value} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', colorClass)}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {entry.feedback && (
        <p className="mt-2 text-sm leading-snug text-neutral-700">{entry.feedback}</p>
      )}

      {/* Author + coach status */}
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">por {entry.authorName}</p>
        {/* Show "awaiting coach" if no internal feedback but also no coach feedback (stub entry) */}
        {entry.presence === 'attended' && !entry.feedback && !entry.rating && !entry.coachSubmittedAt && (
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-600 border border-cyan-200">
            Aguarda treinador
          </span>
        )}
      </div>

      {/* Coach feedback section */}
      {entry.coachSubmittedAt && (
        <CoachFeedbackDisplay entry={entry} />
      )}
    </div>
  );
}

/* ───────────── Coach Link Form (generates link for external coach) ───────────── */

function CoachLinkForm({ playerId, defaultEscalao, onCreated }: {
  playerId: number;
  defaultEscalao?: string | null;
  onCreated: (entry: TFeedback) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [escalao, setEscalao] = useState(defaultEscalao ?? '');
  const [isPending, startTransition] = useTransition();
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  function handleGenerate() {
    if (!date) { toast.error('Data obrigatória'); return; }
    startTransition(async () => {
      const res = await createCoachFeedbackLink(playerId, date, escalao || undefined);
      if (res.success && res.data) {
        setGeneratedUrl(res.data.url);
        await navigator.clipboard.writeText(res.data.url);
        toast.success('Link copiado para a área de transferência!');
        // Create optimistic stub entry for the list
        onCreated({
          id: Date.now(), clubId: '', playerId, authorId: '', authorName: 'Eu',
          trainingDate: date, escalao: escalao || null, presence: 'attended',
          feedback: null, rating: null, decision: 'sem_decisao',
          heightScale: null, buildScale: null, speedScale: null, intensityScale: null, tags: [],
          coachFeedback: null, coachRating: null, coachDecision: null,
          coachHeightScale: null, coachBuildScale: null, coachSpeedScale: null, coachIntensityScale: null,
          coachTags: [], coachName: null, coachSubmittedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      } else {
        toast.error(res.error ?? 'Erro ao gerar link');
      }
    });
  }

  if (generatedUrl) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <Check className="h-5 w-5 text-green-600" />
          </div>
        </div>
        <p className="text-center text-sm font-medium text-neutral-700">Link gerado e copiado!</p>
        <div className="flex items-center gap-1.5 rounded-lg border bg-neutral-50 px-3 py-2">
          <p className="flex-1 truncate text-xs text-neutral-500">{generatedUrl}</p>
          <button
            type="button"
            onClick={async () => { await navigator.clipboard.writeText(generatedUrl); toast.success('Copiado!'); }}
            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-center text-[10px] text-neutral-400">Envie este link ao treinador. Válido por 7 dias.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Gera um link para o treinador preencher a avaliação do jogador. Sem necessidade de conta.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Data do Treino</SectionLabel>
          <TrainingDateInput value={date} onChange={setDate} />
        </div>
        <div>
          <SectionLabel>Escalão</SectionLabel>
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5">
            <GraduationCap className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              value={escalao}
              onChange={(e) => setEscalao(e.target.value)}
              placeholder="Ex: Sub-15"
              className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending || !date}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A gerar...</> : <><Share2 className="h-4 w-4" /> Gerar link</>}
      </button>
    </div>
  );
}

/* ───────────── Coach Feedback Display ───────────── */

function CoachFeedbackDisplay({ entry }: { entry: TFeedback }) {
  const [expanded, setExpanded] = useState(false);
  const coachDecisionConfig = COACH_DECISIONS.find((d) => d.value === entry.coachDecision);

  // Coach physical pairs
  const coachPhysical: { category: string; label: string }[] = [];
  if (entry.coachHeightScale) { const o = HEIGHT_SCALE_OPTIONS.find((x) => x.value === entry.coachHeightScale); if (o) coachPhysical.push({ category: 'Estatura', label: o.labelPt }); }
  if (entry.coachBuildScale) { const o = BUILD_SCALE_OPTIONS.find((x) => x.value === entry.coachBuildScale); if (o) coachPhysical.push({ category: 'Corpo', label: o.labelPt }); }
  if (entry.coachSpeedScale) { const o = SPEED_SCALE_OPTIONS.find((x) => x.value === entry.coachSpeedScale); if (o) coachPhysical.push({ category: 'Velocidade', label: o.labelPt }); }
  if (entry.coachIntensityScale) { const o = INTENSITY_SCALE_OPTIONS.find((x) => x.value === entry.coachIntensityScale); if (o) coachPhysical.push({ category: 'Intensidade', label: o.labelPt }); }

  const coachTags = entry.coachTags.map((tag) => {
    const cat = TRAINING_TAG_CATEGORIES.find((c) => c.tags.some((t) => t.value === tag));
    return { value: tag, label: TRAINING_TAG_LABEL_MAP[tag] ?? tag, category: cat?.category ?? '' };
  });

  return (
    <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50/50 px-2.5 py-2">
      {/* Header: coach name + rating + expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-bold text-cyan-700">Treinador</span>
          {entry.coachName && (
            <span className="text-[10px] text-cyan-600">{entry.coachName}</span>
          )}
          {coachDecisionConfig && (
            <span className={cn('shrink-0 rounded-full border px-1.5 py-px text-[9px] font-bold', coachDecisionConfig.color)}>
              {coachDecisionConfig.icon} {coachDecisionConfig.labelPt}
            </span>
          )}
          {entry.coachRating && (() => {
            const c = RATING_COLORS[entry.coachRating] ?? DEFAULT_COLORS;
            return (
              <span className={cn('flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-bold', c.bg, c.text)}>
                {'★'.repeat(entry.coachRating)}{'☆'.repeat(5 - entry.coachRating)}
                <span className="ml-0.5">{RATING_LABELS[entry.coachRating]}</span>
              </span>
            );
          })()}
        </div>
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-cyan-400 transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* Expanded: full feedback */}
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {entry.coachFeedback && (
            <p className="text-xs leading-snug text-neutral-700">{entry.coachFeedback}</p>
          )}
          {coachPhysical.length > 0 && (
            <p className="text-[10px] text-neutral-500">
              {coachPhysical.map((p, i) => (
                <span key={p.category}>
                  {i > 0 && <span className="mx-1 text-neutral-300">·</span>}
                  <span className="text-neutral-400">{p.category}</span>{' '}
                  <span className="font-semibold text-neutral-700">{p.label}</span>
                </span>
              ))}
            </p>
          )}
          {coachTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {coachTags.map((t) => {
                const colorClass = t.category === 'tecnica' ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : t.category === 'mental' ? 'bg-purple-100 text-purple-700 border-purple-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200';
                return (
                  <span key={t.value} className={cn('rounded-full border px-1.5 py-px text-[9px] font-semibold', colorClass)}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Add Form (inside Dialog) ───────────── */

function AddTrainingFeedbackForm({ playerId, defaultEscalao, currentUserName, onCreated }: {
  playerId: number;
  defaultEscalao?: string | null;
  currentUserName?: string | null;
  onCreated: (entry: TFeedback) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [escalao, setEscalao] = useState(defaultEscalao ?? '');
  const [presence, setPresence] = useState<TrainingPresence>('attended');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [decision, setDecision] = useState<TrainingDecision>('sem_decisao');
  const [heightScale, setHeightScale] = useState<HeightScale | null>(null);
  const [buildScale, setBuildScale] = useState<BuildScale | null>(null);
  const [speedScale, setSpeedScale] = useState<SpeedScale | null>(null);
  const [intensityScale, setIntensityScale] = useState<IntensityScale | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const showStructured = presence === 'attended';

  function handlePresenceChange(p: TrainingPresence) {
    setPresence(p);
    if (p !== 'attended') {
      setDecision('sem_decisao');
      setHeightScale(null); setBuildScale(null); setSpeedScale(null); setIntensityScale(null);
      setTags([]);
    }
  }

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function handleSubmit() {
    if (!date) { toast.error('Data obrigatória'); return; }
    startTransition(async () => {
      const res = await createTrainingFeedback(
        playerId, date, presence, feedback || undefined, rating ?? undefined, escalao || undefined,
        decision, heightScale, buildScale, speedScale, intensityScale, tags,
      );
      if (res.success) {
        onCreated({
          id: Date.now(), clubId: '', playerId, authorId: '', authorName: currentUserName || 'Eu',
          trainingDate: date, escalao: escalao || null, presence, feedback: feedback || null, rating,
          decision, heightScale, buildScale, speedScale, intensityScale, tags,
          coachFeedback: null, coachRating: null, coachDecision: null,
          coachHeightScale: null, coachBuildScale: null, coachSpeedScale: null, coachIntensityScale: null,
          coachTags: [], coachName: null, coachSubmittedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        toast.success('Feedback registado');
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Data + Escalão ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Data do Treino</SectionLabel>
          <TrainingDateInput value={date} onChange={setDate} />
        </div>
        <div>
          <SectionLabel>Escalão</SectionLabel>
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5">
            <GraduationCap className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              value={escalao}
              onChange={(e) => setEscalao(e.target.value)}
              placeholder="Ex: Sub-15"
              className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Presença ── */}
      <div>
        <SectionLabel>Presença</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {TRAINING_PRESENCE.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePresenceChange(opt.value)}
              className={cn(
                'rounded-xl py-2.5 text-sm font-semibold transition text-center',
                presence === opt.value
                  ? opt.color + ' shadow-sm border'
                  : 'border border-neutral-200 text-neutral-400 hover:border-neutral-400',
              )}
            >
              {presence === opt.value && <span className="mr-1">{opt.icon}</span>}
              {opt.labelPt}
            </button>
          ))}
        </div>
      </div>

      {/* ── Avaliação ── */}
      <div>
        <div className="mb-1.5 flex items-baseline gap-2">
          <SectionLabel inline>Avaliação</SectionLabel>
          {rating && (
            <span className={cn('text-xs font-bold', (RATING_COLORS[rating] ?? DEFAULT_COLORS).text)}>
              {RATING_LABELS[rating]}
            </span>
          )}
        </div>
        <RatingBar rating={rating} onChange={setRating} />
      </div>

      {/* ── Decisão (only when attended) ── */}
      {showStructured && (
        <div>
          <SectionLabel>Decisão</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {TRAINING_DECISIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDecision(decision === opt.value ? 'sem_decisao' : opt.value)}
                className={cn(
                  'rounded-xl py-2.5 text-sm font-semibold transition text-center',
                  decision === opt.value
                    ? opt.color + ' shadow-sm border'
                    : 'border border-neutral-200 text-neutral-400 hover:border-neutral-400',
                )}
              >
                {decision === opt.value && <span className="mr-1">{opt.icon}</span>}
                {opt.labelPt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feedback text ── */}
      <div>
        <SectionLabel>Feedback</SectionLabel>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Como correu o treino..."
          rows={3}
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300"
        />
      </div>

      {/* ── Characteristics (only when attended) ── */}
      {showStructured && (
        <>
          {/* Physical scales — segmented bars */}
          <div className="rounded-xl border border-l-[3px] border-l-neutral-400 bg-neutral-50/50 p-3 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Físico</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <ScaleRow label="Estatura" options={HEIGHT_SCALE_OPTIONS} value={heightScale} onChange={(v) => setHeightScale(v as HeightScale | null)} />
              <ScaleRow label="Corpo" options={BUILD_SCALE_OPTIONS} value={buildScale} onChange={(v) => setBuildScale(v as BuildScale | null)} />
              <ScaleRow label="Velocidade" options={SPEED_SCALE_OPTIONS} value={speedScale} onChange={(v) => setSpeedScale(v as SpeedScale | null)} />
              <ScaleRow label="Intensidade" options={INTENSITY_SCALE_OPTIONS} value={intensityScale} onChange={(v) => setIntensityScale(v as IntensityScale | null)} />
            </div>
          </div>

          {/* Tags by category */}
          {TRAINING_TAG_CATEGORIES.map((cat) => {
            const borderColor = cat.category === 'tecnica' ? 'border-l-blue-400' : cat.category === 'mental' ? 'border-l-purple-400' : 'border-l-amber-400';
            return (
              <div key={cat.category} className={cn('rounded-xl border border-l-[3px] bg-neutral-50/50 p-3', borderColor)}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">{cat.labelPt}</p>
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
        </>
      )}

      {/* ── Submit ── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !date}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A guardar...</> : 'Guardar Feedback'}
      </button>
    </div>
  );
}

/* ───────────── Scale Row (label + segmented bar) ───────────── */

function ScaleRow({ label, options, value, onChange }: {
  label: string;
  options: { value: string; labelPt: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium text-neutral-500">{label}</p>
      <div className="flex h-8 gap-0.5 rounded-lg overflow-hidden">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={cn(
              'flex-1 flex items-center justify-center text-xs font-semibold transition-all active:scale-95',
              value === opt.value
                ? 'bg-neutral-800 text-white'
                : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200',
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

/* ───────────── Rating Bar (segmented 1-5, like QSR overall) ───────────── */

function RatingBar({ rating, onChange }: { rating: number | null; onChange: (v: number | null) => void }) {
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
    </div>
  );
}

/* ───────────── Date Input ───────────── */

function TrainingDateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value
    ? new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  return (
    <div
      className="relative flex cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 py-2.5 transition-colors hover:bg-accent"
      onClick={() => ref.current?.showPicker?.()}
    >
      <input ref={ref} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full opacity-0" />
      <Calendar className="h-4 w-4 shrink-0 text-neutral-400" />
      <span className={value ? 'text-sm font-medium text-neutral-700' : 'text-sm text-muted-foreground'}>{display}</span>
    </div>
  );
}

/* ───────────── Section Label ───────────── */

function SectionLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <p className={cn('text-[11px] font-bold uppercase tracking-widest text-neutral-500', !inline && 'mb-1.5')}>{children}</p>;
}

/* ───────────── Rating Colors & Labels ───────────── */

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
