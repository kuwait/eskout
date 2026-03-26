// src/components/players/TrainingFeedback.tsx
// Training feedback list + dialog form — presence, rating, decision, physical scales, tags, text
// Used in the player profile page to track when a player comes to train at the club
// RELEVANT FILES: src/actions/training-feedback.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Calendar, Check, Copy, ExternalLink, GraduationCap, Loader2, Plus, Share2, Star, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  TRAINING_PRESENCE,
  TRAINING_DECISIONS,
  COACH_DECISIONS,
  HEIGHT_SCALE_OPTIONS,
  BUILD_SCALE_OPTIONS,
  SPEED_SCALE_OPTIONS,
  INTENSITY_SCALE_OPTIONS,
  MATURATION_SCALE_OPTIONS,
  TRAINING_TAG_CATEGORIES,
  TRAINING_TAG_LABEL_MAP,
} from '@/lib/constants';
import type {
  BuildScale,
  HeightScale,
  IntensityScale,
  MaturationScale,
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
  // Map of feedbackId → { url, expiresAt } (for "Aguarda treinador" entries)
  const [shareLinks, setShareLinks] = useState<Record<number, { url: string; expiresAt?: string }>>({});

  // Fetch existing share tokens for stub entries (no feedback, no rating, no coach data)
  useEffect(() => {
    const stubIds = entries
      .filter((e) => e.presence === 'attended' && !e.feedback && !e.ratingPerformance && !e.coachSubmittedAt)
      .map((e) => e.id);
    if (stubIds.length === 0) return;
    import('@/actions/training-feedback').then(({ getShareTokensForFeedbacks }) =>
      getShareTokensForFeedbacks(stubIds).then((tokens) => {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const map: Record<number, { url: string; expiresAt?: string }> = {};
        for (const t of tokens) {
          if (!t.usedAt && !t.revokedAt && new Date(t.expiresAt) > new Date()) {
            map[t.feedbackId] = { url: `${appUrl}/feedback/${t.token}`, expiresAt: t.expiresAt };
          }
        }
        if (Object.keys(map).length > 0) {
          setShareLinks((prev) => ({ ...prev, ...map }));
        }
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);
  const [isPending, startTransition] = useTransition();

  const canAdd = userRole === 'admin' || userRole === 'editor' || userRole === 'recruiter';

  // Summary
  const attended = entries.filter((e) => e.presence === 'attended');
  const latest = attended[0];
  const summaryParts: string[] = [];
  if (attended.length > 0) summaryParts.push(`${attended.length} treino${attended.length > 1 ? 's' : ''}`);
  if (latest?.ratingPerformance) summaryParts.push(`Rend. ${latest.ratingPerformance}/5`);
  if (latest?.ratingPotential) summaryParts.push(`Pot. ${latest.ratingPotential}/5`);
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir feedback ao treinador</DialogTitle>
          </DialogHeader>
          <CoachLinkForm
            playerId={playerId}
            defaultEscalao={defaultEscalao}
            onCreated={(entry, url) => {
              setEntries((prev) => [entry, ...prev]);
              if (url) setShareLinks((prev) => ({ ...prev, [entry.id]: { url } }));
            }}
            onClose={() => setCoachDialogOpen(false)}
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
          shareLink={shareLinks[entry.id]}
        />
      ))}
    </div>
  );
}

/* ───────────── Feedback Entry Card ───────────── */

function FeedbackEntry({ entry, canDelete, onDelete, isPending, shareLink }: {
  entry: TFeedback;
  canDelete: boolean;
  onDelete: () => void;
  isPending: boolean;
  shareLink?: { url: string; expiresAt?: string };
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateLabel = new Date(entry.trainingDate).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  // Determine if this is a stub awaiting coach
  const isStub = entry.presence === 'attended' && !entry.feedback && !entry.ratingPerformance && !entry.coachSubmittedAt;
  // Compute days remaining for share link
  const daysRemaining = shareLink?.expiresAt
    ? Math.max(0, Math.ceil((new Date(shareLink.expiresAt).getTime() - new Date().getTime()) / 86400000))
    : 7;
  // Has any content to display (internal or coach)
  const hasCoach = !!entry.coachSubmittedAt;

  // Merge internal + coach data for display (coach data takes priority on stubs)
  const feedback = entry.coachFeedback ?? entry.feedback;
  const rPerf = entry.coachRatingPerformance ?? entry.ratingPerformance;
  const rPot = entry.coachRatingPotential ?? entry.ratingPotential;
  const decision = entry.coachDecision ?? (entry.decision !== 'sem_decisao' ? entry.decision : null);
  const decisionConfig = decision ? [...TRAINING_DECISIONS, ...COACH_DECISIONS].find((d) => d.value === decision) : null;
  const authorName = hasCoach ? entry.coachName : (entry.feedback || entry.ratingPerformance) ? entry.authorName : null;

  // Physical (merge coach + internal)
  const physicalPairs: { category: string; label: string }[] = [];
  const hs = entry.coachHeightScale ?? entry.heightScale;
  const bs = entry.coachBuildScale ?? entry.buildScale;
  const ss = entry.coachSpeedScale ?? entry.speedScale;
  const is_ = entry.coachIntensityScale ?? entry.intensityScale;
  const ms = entry.coachMaturation ?? entry.maturation;
  if (hs) { const o = HEIGHT_SCALE_OPTIONS.find((x) => x.value === hs); if (o) physicalPairs.push({ category: 'Estatura', label: o.labelPt }); }
  if (bs) { const o = BUILD_SCALE_OPTIONS.find((x) => x.value === bs); if (o) physicalPairs.push({ category: 'Corpo', label: o.labelPt }); }
  if (ss) { const o = SPEED_SCALE_OPTIONS.find((x) => x.value === ss); if (o) physicalPairs.push({ category: 'Velocidade', label: o.labelPt }); }
  if (is_) { const o = INTENSITY_SCALE_OPTIONS.find((x) => x.value === is_); if (o) physicalPairs.push({ category: 'Intensidade', label: o.labelPt }); }
  if (ms) { const o = MATURATION_SCALE_OPTIONS.find((x) => x.value === ms); if (o) physicalPairs.push({ category: 'Maturação', label: o.labelPt }); }

  // Tags (merge)
  const allTags = entry.coachTags.length > 0 ? entry.coachTags : entry.tags;
  const tagsByCategory = allTags.map((tag) => {
    const cat = TRAINING_TAG_CATEGORIES.find((c) => c.tags.some((t) => t.value === tag));
    return { value: tag, label: TRAINING_TAG_LABEL_MAP[tag] ?? tag, category: cat?.category ?? '' };
  });

  // ── Stub card: awaiting coach feedback ──
  if (isStub) {
    return (
      <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-100/50 px-4 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-400">{dateLabel}</span>
              {entry.escalao && (
                <span className="rounded-full bg-neutral-200/60 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                  {entry.escalao}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              Aguarda <span className="font-semibold text-neutral-600">feedback</span> por parte do treinador
            </p>
            <p className="mt-0.5 text-[10px] text-neutral-400/70">
              Válido por {daysRemaining} dia{daysRemaining !== 1 ? 's' : ''}
            </p>
          </div>
          {canDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={isPending} className="rounded p-1 text-neutral-400 hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
        {shareLink && (
          <div className="mt-3">
            <ShareLinkButtons url={shareLink.url} />
          </div>
        )}
      </div>
    );
  }

  // ── Normal card: same visual language as QuickReportCard ──
  const BAR_COLORS: Record<number, string> = { 1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-sky-500', 4: 'bg-teal-500', 5: 'bg-green-500' };
  const mainRating = rPerf ?? 0;
  const ratingBg = mainRating >= 4 ? 'bg-green-50' : mainRating === 3 ? 'bg-sky-50' : mainRating === 2 ? 'bg-orange-50' : mainRating >= 1 ? 'bg-red-50' : 'bg-neutral-50';
  const ratingBorder = mainRating >= 4 ? 'border-green-200' : mainRating === 3 ? 'border-sky-200' : mainRating === 2 ? 'border-orange-200' : mainRating >= 1 ? 'border-red-200' : 'border-neutral-200';
  const dotColor = BAR_COLORS[mainRating] ?? 'bg-neutral-400';

  return (
    <div className={cn('overflow-hidden rounded-lg border', ratingBorder)}>
      {/* Header — colored background, compact info */}
      <div className={cn('flex items-center gap-3 px-3 py-2.5', ratingBg)}>
        {/* Rating dot */}
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', dotColor)}>
          {mainRating || '–'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900">{dateLabel}</span>
            {entry.escalao && (
              <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{entry.escalao}</span>
            )}
            {decisionConfig && (
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', decisionConfig.colorActive)}>
                {decisionConfig.labelPt}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {authorName && <span>{hasCoach ? `Mister ${authorName}` : authorName}</span>}
          </div>
        </div>

        {canDelete && (
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={isPending} className="shrink-0 rounded p-1 text-neutral-400 hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button>
        )}
      </div>

      {/* Body — ratings as segmented bars + text + tags */}
      <div className="px-3 py-3 space-y-3">
        {/* Rating bars — same style as QuickReportCard dimensions */}
        {rPerf && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">⭐</span>
              <span className="text-xs font-semibold">Rendimento</span>
              <span className={cn('text-sm font-black', (RATING_COLORS[rPerf] ?? DEFAULT_COLORS).text)}>{rPerf}</span>
            </div>
            <div className="flex h-2 w-full gap-0.5 rounded-md overflow-hidden">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className={cn('flex-1', n <= rPerf ? (BAR_COLORS[rPerf] ?? 'bg-neutral-300') : 'bg-neutral-100')} />
              ))}
            </div>
          </div>
        )}
        {rPot && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">📈</span>
              <span className="text-xs font-semibold">Potencial</span>
              <span className={cn('text-sm font-black', (RATING_COLORS[rPot] ?? DEFAULT_COLORS).text)}>{rPot}</span>
            </div>
            <div className="flex h-2 w-full gap-0.5 rounded-md overflow-hidden">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className={cn('flex-1', n <= rPot ? (BAR_COLORS[rPot] ?? 'bg-neutral-300') : 'bg-neutral-100')} />
              ))}
            </div>
          </div>
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

        {/* Category tags */}
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

        {/* Feedback text — in a subtle green box like QSR notes */}
        {feedback && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
            <p className="text-[10px] font-bold text-green-700 mb-1">Notas</p>
            <p className="text-sm leading-relaxed text-neutral-700">{feedback}</p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-red-600 text-white hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Coach Link Form (generates link for external coach) ───────────── */

function CoachLinkForm({ playerId, defaultEscalao, onCreated, onClose }: {
  playerId: number;
  defaultEscalao?: string | null;
  onCreated: (entry: TFeedback, url?: string) => void;
  onClose: () => void;
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
          feedback: null, rating: null, ratingPerformance: null, ratingPotential: null, decision: 'sem_decisao',
          heightScale: null, buildScale: null, speedScale: null, intensityScale: null, maturation: null, tags: [],
          coachFeedback: null, coachRating: null, coachRatingPerformance: null, coachRatingPotential: null,
          coachDecision: null, coachHeightScale: null, coachBuildScale: null,
          coachSpeedScale: null, coachIntensityScale: null, coachMaturation: null,
          coachTags: [], coachObservedPosition: null, coachName: null, coachSubmittedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }, res.data.url);
      } else {
        toast.error(res.error ?? 'Erro ao gerar link');
      }
    });
  }

  const [linkCopied, setLinkCopied] = useState(false);

  if (generatedUrl) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <Check className="h-5 w-5 text-green-600" />
          </div>
        </div>
        <p className="text-center text-sm font-medium text-neutral-700">Link gerado e copiado!</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(generatedUrl);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition',
              linkCopied
                ? 'border-green-300 bg-green-50 text-green-600'
                : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50',
            )}
          >
            {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {linkCopied ? 'Copiado!' : 'Copiar link'}
          </button>
          <a
            href={generatedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir
          </a>
        </div>
        <p className="text-center text-[10px] text-neutral-400">Envie ao treinador. Válido por 7 dias.</p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
        >
          Fechar
        </button>
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
  const [ratingPerformance, setRatingPerformance] = useState<number | null>(null);
  const [ratingPotential, setRatingPotential] = useState<number | null>(null);
  const [decision, setDecision] = useState<TrainingDecision>('sem_decisao');
  const [heightScale, setHeightScale] = useState<HeightScale | null>(null);
  const [buildScale, setBuildScale] = useState<BuildScale | null>(null);
  const [speedScale, setSpeedScale] = useState<SpeedScale | null>(null);
  const [intensityScale, setIntensityScale] = useState<IntensityScale | null>(null);
  const [maturation, setMaturation] = useState<MaturationScale | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [observedPositions, setObservedPositions] = useState<string[]>([]);

  const showStructured = presence === 'attended';

  function handlePresenceChange(p: TrainingPresence) {
    setPresence(p);
    if (p !== 'attended') {
      setDecision('sem_decisao');
      setHeightScale(null); setBuildScale(null); setSpeedScale(null); setIntensityScale(null); setMaturation(null);
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
        playerId, date, presence, feedback || undefined, undefined, escalao || undefined,
        decision, heightScale, buildScale, speedScale, intensityScale, tags,
        ratingPerformance ?? undefined, ratingPotential ?? undefined, maturation,
      );
      if (res.success) {
        onCreated({
          id: Date.now(), clubId: '', playerId, authorId: '', authorName: currentUserName || 'Eu',
          trainingDate: date, escalao: escalao || null, presence, feedback: feedback || null,
          rating: ratingPerformance, ratingPerformance, ratingPotential,
          decision, heightScale, buildScale, speedScale, intensityScale, maturation, tags,
          coachFeedback: null, coachRating: null, coachRatingPerformance: null, coachRatingPotential: null,
          coachDecision: null, coachHeightScale: null, coachBuildScale: null,
          coachSpeedScale: null, coachIntensityScale: null, coachMaturation: null,
          coachTags: [], coachObservedPosition: null, coachName: null, coachSubmittedAt: null,
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

      {/* ── Posição observada (only when attended) ── */}
      {showStructured && (
        <div>
          <SectionLabel info="Em que posição jogou o atleta durante o treino">Posição observada</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'].map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setObservedPositions((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos])}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  observedPositions.includes(pos)
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
                )}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Avaliação dupla: Rendimento + Potencial ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <SectionLabel inline info="Jogador de rendimento — pronto para jogar e contribuir já">Rendimento</SectionLabel>
            {ratingPerformance && (
              <span className={cn('text-xs font-bold', (RATING_COLORS[ratingPerformance] ?? DEFAULT_COLORS).text)}>
                {RATING_LABELS[ratingPerformance]}
              </span>
            )}
          </div>
          <RatingBar rating={ratingPerformance} onChange={setRatingPerformance} />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <SectionLabel inline info="Jogador de potencial — pode evoluir muito com tempo e contexto certo">Potencial</SectionLabel>
            {ratingPotential && (
              <span className={cn('text-xs font-bold', (RATING_COLORS[ratingPotential] ?? DEFAULT_COLORS).text)}>
                {RATING_LABELS[ratingPotential]}
              </span>
            )}
          </div>
          <RatingBar rating={ratingPotential} onChange={setRatingPotential} />
        </div>
      </div>

      {/* ── Decisão (only when attended) ── */}
      {showStructured && (
        <div>
          <SectionLabel info="Assinar = queremos · Repetir = outro treino · Dúvidas = precisa avaliar · Descartar = não interessa">Decisão</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {TRAINING_DECISIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDecision(decision === opt.value ? 'sem_decisao' : opt.value)}
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
          {/* Physical scales — same layout as coach page */}
          <div className="rounded-xl border border-l-[3px] border-l-cyan-400 bg-neutral-50/50 p-3 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-600">⚡ Físico</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <ScaleBlock label="Estatura" options={HEIGHT_SCALE_OPTIONS} value={heightScale} onChange={(v) => setHeightScale(v as HeightScale | null)} info="Alto = acima da média · Normal = na média · Baixo = abaixo" />
              <ScaleBlock label="Corpo" options={BUILD_SCALE_OPTIONS} value={buildScale} onChange={(v) => setBuildScale(v as BuildScale | null)} info="Ecto = magro/longilíneo · Meso = atlético · Endo = robusto" />
              <ScaleBlock label="Velocidade" options={SPEED_SCALE_OPTIONS} value={speedScale} onChange={(v) => setSpeedScale(v as SpeedScale | null)} info="Rápido = destaca-se · Normal = na média · Lento = abaixo" />
              <ScaleBlock label="Intensidade" options={INTENSITY_SCALE_OPTIONS} value={intensityScale} onChange={(v) => setIntensityScale(v as IntensityScale | null)} info="Intenso = esforço máximo · Pouco = baixa energia" />
            </div>
            <ScaleBlock label="Maturação" options={MATURATION_SCALE_OPTIONS} value={maturation} onChange={(v) => setMaturation(v as MaturationScale | null)} info="Nada = pré-pubertário · Início = início do pico de crescimento · Maturado = pico atingido · Super = muito avançado para a idade" />
          </div>

          {/* Tags by category — each in its own colored card */}
          {TRAINING_TAG_CATEGORIES.map((cat) => {
            const catColor = TAG_CATEGORY_COLORS[cat.category] ?? TAG_CATEGORY_COLORS.adaptacao;
            return (
              <div key={cat.category} className={cn('rounded-xl border border-l-[3px] bg-neutral-50/50 p-3', catColor.border)}>
                <div className="mb-2 flex items-center gap-1">
                  <p className={cn('text-[11px] font-bold uppercase tracking-widest', catColor.label)}>{catColor.emoji} {cat.labelPt}</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-bold text-neutral-500 hover:bg-neutral-300">i</button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="w-52 rounded-lg border-neutral-200 bg-neutral-900 p-2.5 text-[11px] leading-relaxed text-neutral-200 shadow-lg">
                      <p>{catColor.info}</p>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.tags.map((tag) => {
                    const selected = tags.includes(tag.value);
                    return (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => toggleTag(tag.value)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                          selected
                            ? (NEGATIVE_TAGS.has(tag.value) ? 'bg-red-100 text-red-700 border-red-300 shadow-sm' : 'bg-green-100 text-green-700 border-green-300 shadow-sm')
                            : catColor.unselected,
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

/* ───────────── Share Link Buttons (copy + open in new tab) ───────────── */

function ShareLinkButtons({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition',
          copied
            ? 'bg-green-50 text-green-600 border-green-200'
            : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200',
        )}
      >
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-200 transition"
      >
        <ExternalLink className="h-2.5 w-2.5" />
        Abrir
      </a>
    </div>
  );
}

/* ───────────── Scale Block (label on top, buttons below — matches coach page) ───────────── */

function ScaleBlock({ label, options, value, onChange, info }: {
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
              'flex-1 flex items-center justify-center text-[11px] font-semibold transition-all active:scale-95',
              value === opt.value
                ? 'bg-cyan-600 text-white'
                : 'bg-neutral-200/60 text-neutral-500 hover:bg-neutral-200',
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

function SectionLabel({ children, inline, info }: { children: React.ReactNode; inline?: boolean; info?: string }) {
  return (
    <div className={cn('flex items-center gap-1', !inline && 'mb-1.5')}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">{children}</p>
      {info && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-bold text-neutral-500 hover:bg-neutral-300">i</button>
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
  );
}

/** Tags with negative sentiment — displayed in red when selected */
const NEGATIVE_TAGS = new Set(['perde_muitas_bolas', 'agarrado_bola', 'trapalhao', 'sem_nocao_espaco', 'desorientado', 'timido', 'nervoso', 'agressivo', 'desligado', 'dificuldade_contexto', 'nivel_abaixo']);

/* ───────────── Tag Category Colors ───────────── */

const TAG_CATEGORY_COLORS: Record<string, { label: string; emoji: string; selected: string; unselected: string; border: string; info: string }> = {
  tecnica:   { label: 'text-blue-600',   emoji: '⚽', selected: 'bg-blue-500 text-white border-blue-500',     unselected: 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300', border: 'border-l-blue-400', info: 'O que faz bem ou mal com bola' },
  tatico:    { label: 'text-teal-600',   emoji: '🧩', selected: 'bg-teal-500 text-white border-teal-500',     unselected: 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-300', border: 'border-l-teal-400', info: 'Leitura do jogo e inteligência posicional' },
  mental:    { label: 'text-purple-600', emoji: '🧠', selected: 'bg-purple-500 text-white border-purple-500', unselected: 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300', border: 'border-l-purple-400', info: 'Personalidade e comportamento em campo' },
  adaptacao: { label: 'text-amber-600',  emoji: '🔄', selected: 'bg-amber-500 text-white border-amber-500',   unselected: 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300', border: 'border-l-amber-400', info: 'Como reagiu ao contexto e nível do treino' },
};

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
