// src/components/players/TrainingSessionsList.tsx
// Lista de treinos à experiência (Fase 3 — migration 107). Substitui TrainingFeedback.tsx.
// Suporta agendar futuro + registar passado + avaliar + gerar link treinador + cancelar + faltou.
// RELEVANT FILES: src/actions/training-feedback.ts, src/lib/types/index.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Calendar, Check, Copy, ExternalLink, GraduationCap, Loader2, MapPin, MoreVertical, Pencil, Plus,
  Share2, Star, Trash2, UserX, XCircle,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  TRAINING_DECISIONS, COACH_DECISIONS,
  HEIGHT_SCALE_OPTIONS, BUILD_SCALE_OPTIONS, SPEED_SCALE_OPTIONS,
  INTENSITY_SCALE_OPTIONS, MATURATION_SCALE_OPTIONS,
  TRAINING_TAG_CATEGORIES, TRAINING_TAG_LABEL_MAP,
} from '@/lib/constants';
import type {
  BuildScale, HeightScale, IntensityScale, MaturationScale, SpeedScale,
  TrainingDecision, TrainingFeedback as TFeedback, TrainingStatus, UserRole,
} from '@/lib/types';
import {
  scheduleTraining, rescheduleTraining, cancelTraining, markTrainingMissed,
  registerPastTraining, updateTrainingEvaluation,
  deleteTrainingFeedback, createCoachFeedbackLink,
} from '@/actions/training-feedback';
import { cn } from '@/lib/utils';
import { countdownLabel as computeCountdownLabel, daysUntil } from '@/lib/utils/training-sessions';

/* ───────────── Props ───────────── */

interface Props {
  playerId: number;
  entries: TFeedback[];
  userRole: UserRole;
  defaultEscalao?: string | null;
  currentUserId?: string | null;
  /** Server-rendered share tokens — avoids client POST on mount */
  initialShareTokens?: { feedbackId: number; tokenId: number; token: string; usedAt: string | null; revokedAt: string | null; expiresAt: string; coachName: string | null }[];
}

/* ───────────── Status pill config ───────────── */

const STATUS_CONFIG: Record<TrainingStatus, { label: string; classes: string }> = {
  agendado: { label: 'Agendado', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  realizado: { label: 'Realizado', classes: 'bg-green-50 text-green-700 border-green-200' },
  cancelado: { label: 'Cancelado', classes: 'bg-neutral-100 text-neutral-500 border-neutral-200 line-through' },
  faltou: { label: 'Faltou', classes: 'bg-red-50 text-red-600 border-red-200' },
};

/** Rating → cores consistentes com QuickReportCard e design antigo de TrainingFeedback */
const BAR_COLORS: Record<number, string> = {
  1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-sky-500', 4: 'bg-teal-500', 5: 'bg-green-500',
};
const RATING_TEXT_COLORS: Record<number, string> = {
  1: 'text-red-600', 2: 'text-orange-600', 3: 'text-sky-600', 4: 'text-teal-700', 5: 'text-green-700',
};

/* ───────────── Main ───────────── */

export function TrainingSessionsList({
  playerId, entries: initialEntries, userRole, defaultEscalao, currentUserId, initialShareTokens,
}: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const canEdit = userRole === 'admin' || userRole === 'editor' || userRole === 'recruiter';

  // Live sync share tokens (agendados com link activo)
  const [shareLinks, setShareLinks] = useState<Record<number, { url: string; expiresAt: string }>>(() => {
    const map: Record<number, { url: string; expiresAt: string }> = {};
    for (const t of initialShareTokens ?? []) {
      if (!t.usedAt && !t.revokedAt && new Date(t.expiresAt) > new Date()) {
        map[t.feedbackId] = { url: `/feedback/${t.token}`, expiresAt: t.expiresAt };
      }
    }
    return map;
  });

  useEffect(() => {
    if (initialShareTokens) return;
    // Fetch active tokens for all entries
    import('@/actions/training-feedback').then(({ getShareTokensForFeedbacks }) =>
      getShareTokensForFeedbacks(entries.map((e) => e.id)).then((tokens) => {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const map: Record<number, { url: string; expiresAt: string }> = {};
        for (const t of tokens) {
          if (!t.usedAt && !t.revokedAt && new Date(t.expiresAt) > new Date()) {
            map[t.feedbackId] = { url: `${appUrl}/feedback/${t.token}`, expiresAt: t.expiresAt };
          }
        }
        setShareLinks((prev) => ({ ...prev, ...map }));
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, []);

  // Counters
  const agendados = entries.filter((e) => e.status === 'agendado').length;
  const realizados = entries.filter((e) => e.status === 'realizado').length;
  const comAval = entries.filter((e) => e.status === 'realizado' && (e.feedback || e.ratingPerformance)).length;

  return (
    <div className="space-y-4">
      {/* CTAs — registar (principal, esq) + agendar (secundário, dir) */}
      {canEdit && (
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setPastOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            <Plus className="h-4 w-4 text-neutral-500" />
            Registar treino
          </button>
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            title="Agendar treino futuro"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-50"
          >
            <Calendar className="h-3.5 w-3.5" />
            Agendar
          </button>
        </div>
      )}

      {/* Contadores */}
      {entries.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {agendados > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              {agendados} agendado{agendados !== 1 ? 's' : ''}
            </span>
          )}
          {realizados > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              {realizados} realizado{realizados !== 1 ? 's' : ''}
            </span>
          )}
          {comAval > 0 && (
            <span className="text-neutral-400">· {comAval} com avaliação</span>
          )}
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center">
          <Calendar className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 text-sm text-muted-foreground">Ainda sem treinos à experiência</p>
          {canEdit && (
            <p className="mt-1 text-xs text-neutral-400">Carrega em &ldquo;Agendar treino&rdquo; para começar</p>
          )}
        </div>
      )}

      {/* Cards */}
      {entries.map((entry) => (
        <TrainingCard
          key={entry.id}
          entry={entry}
          userRole={userRole}
          currentUserId={currentUserId}
          shareLink={shareLinks[entry.id]}
          onUpdate={(updated) => setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))}
          onDelete={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
          onShareLink={(feedbackId, url, expiresAt) =>
            setShareLinks((prev) => ({ ...prev, [feedbackId]: { url, expiresAt } }))}
        />
      ))}

      {/* Dialog: Agendar treino */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Agendar treino</DialogTitle></DialogHeader>
          <ScheduleForm
            playerId={playerId}
            defaultEscalao={defaultEscalao}
            onDone={(newEntries) => {
              setEntries((prev) => [...newEntries, ...prev]);
              setScheduleOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: Registar treino passado */}
      <Dialog open={pastOpen} onOpenChange={setPastOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Registar treino passado</DialogTitle></DialogHeader>
          <RegisterPastForm
            playerId={playerId}
            defaultEscalao={defaultEscalao}
            onDone={(entry) => {
              setEntries((prev) => [entry, ...prev]);
              setPastOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Training Card ───────────── */

function TrainingCard({
  entry, userRole, currentUserId, shareLink, onUpdate, onDelete, onShareLink,
}: {
  entry: TFeedback;
  userRole: UserRole;
  currentUserId?: string | null;
  shareLink?: { url: string; expiresAt: string };
  onUpdate: (e: TFeedback) => void;
  onDelete: (id: number) => void;
  onShareLink: (feedbackId: number, url: string, expiresAt: string) => void;
}) {
  const [evalOpen, setEvalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  const canEdit = userRole === 'admin' || userRole === 'editor' || userRole === 'recruiter';
  const canDelete = userRole === 'admin' || entry.authorId === currentUserId;

  const dateLabel = new Date(entry.trainingDate).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const datePassed = new Date(entry.trainingDate) < new Date(new Date().setHours(0, 0, 0, 0));

  // Status pode vir de dados legacy pré-migration 107 ou optimistic stubs — fallback defensivo
  const status: TrainingStatus = (entry.status && STATUS_CONFIG[entry.status])
    ? entry.status
    : 'realizado';
  const pill = STATUS_CONFIG[status];

  const hasEval = !!(entry.feedback || entry.ratingPerformance || entry.ratingPotential || entry.coachSubmittedAt);
  const hasCoach = !!entry.coachSubmittedAt;

  // Warning: agendado com data passada
  const showOverdueBadge = status === 'agendado' && datePassed;
  // Warning: realizado sem avaliação
  const showPendingEvalBadge = status === 'realizado' && !hasEval;

  // Merge internal + coach for display (they're exclusive per spec, but DB may have both pre-107)
  const fb = entry.coachFeedback ?? entry.feedback;
  const rPerf = entry.coachRatingPerformance ?? entry.ratingPerformance;
  const rPot = entry.coachRatingPotential ?? entry.ratingPotential;
  const decision = entry.coachDecision ?? (entry.decision !== 'sem_decisao' ? entry.decision : null);
  const decisionConfig = decision
    ? [...TRAINING_DECISIONS, ...COACH_DECISIONS].find((d) => d.value === decision)
    : null;
  const authorName = hasCoach ? entry.coachName : entry.authorName;

  // Physical scales (merge staff + coach)
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

  // Tags by category (merge)
  const allTags = entry.coachTags.length > 0 ? entry.coachTags : entry.tags;
  const tagsByCategory = allTags.map((tag) => {
    const cat = TRAINING_TAG_CATEGORIES.find((c) => c.tags.some((t) => t.value === tag));
    return { value: tag, label: TRAINING_TAG_LABEL_MAP[tag] ?? tag, category: cat?.category ?? '' };
  });

  // Observed positions
  const observedPos = entry.coachObservedPosition ?? entry.observedPosition;
  const observedList = observedPos ? observedPos.split(',').map((p) => p.trim()).filter(Boolean) : [];

  // Border & background — rating-based colors quando há avaliação (match design antigo)
  const mainRating = rPerf ?? 0;
  const ratingBg =
    mainRating >= 4 ? 'bg-green-50' :
    mainRating === 3 ? 'bg-sky-50' :
    mainRating === 2 ? 'bg-orange-50' :
    mainRating >= 1 ? 'bg-red-50' :
    null;
  const ratingBorderClass =
    mainRating >= 4 ? 'border-green-200' :
    mainRating === 3 ? 'border-sky-200' :
    mainRating === 2 ? 'border-orange-200' :
    mainRating >= 1 ? 'border-red-200' :
    null;
  // Fallback para estado quando não há rating
  const stateBorderClass = status === 'agendado' ? 'border-amber-200' :
    status === 'faltou' ? 'border-red-200' :
    'border-neutral-200';
  const borderClass = ratingBorderClass ?? stateBorderClass;
  // Header bg: rating-based se avaliado, senão neutro
  const headerBg = ratingBg ?? 'bg-neutral-50/50';
  const dotColor = BAR_COLORS[mainRating] ?? 'bg-neutral-300';

  // Countdown (só relevante para agendado) — helpers puros em lib/utils/training-sessions
  const days = daysUntil(entry.trainingDate);
  const countdownLabel = status === 'agendado' ? computeCountdownLabel(days) : null;

  // Header visual por estado
  const headerIcon = (() => {
    if (status === 'realizado' && mainRating > 0) return null; // show number
    if (status === 'agendado') return showOverdueBadge ? <AlertTriangle className="h-5 w-5 text-orange-600" /> : <Calendar className="h-5 w-5 text-amber-600" />;
    if (status === 'cancelado') return <XCircle className="h-5 w-5 text-neutral-500" />;
    if (status === 'faltou') return <UserX className="h-5 w-5 text-red-500" />;
    return null; // realizado sem rating (pendente) cai aqui
  })();
  const headerIconBg = (() => {
    if (status === 'agendado') return showOverdueBadge ? 'bg-orange-100' : 'bg-amber-100';
    if (status === 'cancelado') return 'bg-neutral-200';
    if (status === 'faltou') return 'bg-red-100';
    if (status === 'realizado' && !headerIcon && mainRating === 0) return 'bg-yellow-100'; // realizado pendente
    return dotColor;
  })();

  return (
    <div className={cn(
      'overflow-hidden rounded-lg border',
      borderClass,
      status === 'cancelado' && 'opacity-60',
    )}>
      {/* Header — rating dot + data + pill */}
      <div className={cn('flex items-start gap-3 px-3 py-2.5', headerBg)}>
        {/* Dot — rating number OR icon por estado */}
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          mainRating > 0 ? 'text-white' : '',
          headerIconBg)}>
          {headerIcon ?? (mainRating > 0 ? mainRating : <AlertTriangle className="h-4 w-4 text-yellow-700" />)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-neutral-900">{dateLabel}</span>
            {entry.sessionTime && (
              <span className="text-xs text-neutral-500">{entry.sessionTime.slice(0, 5)}</span>
            )}
            {entry.escalao && (
              <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{entry.escalao}</span>
            )}
            {decisionConfig && (
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', decisionConfig.colorActive)}>
                {decisionConfig.labelPt}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className={cn('rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider', pill.classes)}>
              {pill.label}
            </span>
            {countdownLabel && !showOverdueBadge && (
              <span className="text-[10px] font-normal lowercase text-neutral-500">· {countdownLabel}</span>
            )}
            {showOverdueBadge && (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0 text-[9px] font-semibold uppercase text-orange-700">
                Data passou
              </span>
            )}
            {showPendingEvalBadge && (
              <span className="rounded-full border border-yellow-200 bg-yellow-50 px-1.5 py-0 text-[9px] font-semibold uppercase text-yellow-700">
                Sem avaliação
              </span>
            )}
            {shareLink && status === 'agendado' && (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0 text-[9px] font-semibold uppercase text-cyan-700">
                Aguarda treinador
              </span>
            )}
            {entry.location && <span className="inline-flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> {entry.location}</span>}
            {authorName && hasEval && <span>· {hasCoach ? `Mister ${authorName}` : authorName}</span>}
          </div>
        </div>
        {canEdit && (() => {
          const showAgendadoItems = status === 'agendado';
          const showRealizadoNoEvalItems = status === 'realizado' && !hasEval;
          const showEditEval = status === 'realizado' && hasEval && (entry.authorId === currentUserId || userRole === 'admin');
          const hasStatusItems = showAgendadoItems || showRealizadoNoEvalItems || showEditEval;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {showAgendadoItems && (
                  <>
                    <DropdownMenuItem onClick={() => setEvalOpen(true)}>
                      <Star className="mr-2 h-4 w-4" /> Preencher avaliação
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCoachOpen(true)}>
                      <Share2 className="mr-2 h-4 w-4" /> Pedir ao treinador
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar data/hora
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setMissedOpen(true)}>
                      <UserX className="mr-2 h-4 w-4" /> Marcar faltou
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCancelOpen(true)}>
                      <XCircle className="mr-2 h-4 w-4" /> Cancelar treino
                    </DropdownMenuItem>
                  </>
                )}
                {showRealizadoNoEvalItems && (
                  <>
                    <DropdownMenuItem onClick={() => setEvalOpen(true)}>
                      <Star className="mr-2 h-4 w-4" /> Preencher avaliação
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCoachOpen(true)}>
                      <Share2 className="mr-2 h-4 w-4" /> Pedir ao treinador
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar data/hora
                    </DropdownMenuItem>
                  </>
                )}
                {showEditEval && (
                  <>
                    <DropdownMenuItem onClick={() => setEvalOpen(true)}>
                      <Star className="mr-2 h-4 w-4" /> Editar avaliação
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar data/hora
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && (
                  <>
                    {hasStatusItems && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" /> Apagar treino
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}
      </div>

      {/* Body — ratings com emoji, físico, tags, notas verdes (match design antigo) */}
      {(hasEval || fb || entry.cancelledReason || (shareLink && status === 'agendado') || observedList.length > 0 || physicalPairs.length > 0 || tagsByCategory.length > 0) && (
        <div className="px-3 py-3 space-y-3">
          {/* Posição observada */}
          {observedList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Posição</span>
              {observedList.map((pos) => (
                <span key={pos} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {pos}
                </span>
              ))}
            </div>
          )}

          {/* Rating bars — lado a lado */}
          {(rPerf || rPot) && (
            <div className="grid grid-cols-2 gap-3">
              {rPerf ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">⭐</span>
                    <span className="text-xs font-semibold">Rendimento</span>
                    <span className={cn('text-sm font-black', RATING_TEXT_COLORS[rPerf] ?? 'text-neutral-500')}>{rPerf}</span>
                  </div>
                  <div className="flex h-2 w-full gap-0.5 rounded-md overflow-hidden">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className={cn('flex-1', n <= rPerf ? (BAR_COLORS[rPerf] ?? 'bg-neutral-300') : 'bg-neutral-100')} />
                    ))}
                  </div>
                </div>
              ) : <div />}
              {rPot ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">📈</span>
                    <span className="text-xs font-semibold">Potencial</span>
                    <span className={cn('text-sm font-black', RATING_TEXT_COLORS[rPot] ?? 'text-neutral-500')}>{rPot}</span>
                  </div>
                  <div className="flex h-2 w-full gap-0.5 rounded-md overflow-hidden">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className={cn('flex-1', n <= rPot ? (BAR_COLORS[rPot] ?? 'bg-neutral-300') : 'bg-neutral-100')} />
                    ))}
                  </div>
                </div>
              ) : <div />}
            </div>
          )}

          {/* Escalas físicas — pills cinza */}
          {physicalPairs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {physicalPairs.map((p) => (
                <span key={p.category} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                  {p.category}: {p.label}
                </span>
              ))}
            </div>
          )}

          {/* Tags por categoria — pills coloridos por categoria */}
          {tagsByCategory.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tagsByCategory.map((t) => {
                const colorClass =
                  t.category === 'tecnica' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                  t.category === 'tatico' ? 'bg-teal-50 text-teal-600 border-teal-200' :
                  t.category === 'mental' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                  'bg-amber-50 text-amber-600 border-amber-200';
                return (
                  <span key={t.value} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', colorClass)}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Notas — título inline, texto wrapa por baixo */}
          {fb && (
            <p className="rounded-lg bg-green-50/60 border border-green-100 px-3 py-2 text-[11px] font-light leading-[1.5] text-neutral-500">
              <span className="mr-1.5 text-[9px] font-bold uppercase tracking-wide text-green-600/80 align-baseline">Notas</span>
              {fb}
            </p>
          )}

          {/* Cancel/faltou reason */}
          {(status === 'cancelado' || status === 'faltou') && entry.cancelledReason && (
            <p className="text-xs text-muted-foreground italic">&ldquo;{entry.cancelledReason}&rdquo;</p>
          )}

          {/* Share link actions */}
          {shareLink && status === 'agendado' && (
            <div className="flex items-center gap-2">
              <ShareLinkActions url={shareLink.url} />
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <EvaluateDialog
        open={evalOpen}
        onOpenChange={setEvalOpen}
        entry={entry}
        onSaved={(updated) => { onUpdate(updated); setEvalOpen(false); }}
      />
      <EditTrainingDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={entry}
        onSaved={(updated) => { onUpdate(updated); setEditOpen(false); }}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        trainingId={entry.id}
        onDone={(reason) => { onUpdate({ ...entry, status: 'cancelado', cancelledReason: reason, cancelledAt: new Date().toISOString() }); setCancelOpen(false); }}
      />
      <MissedDialog
        open={missedOpen}
        onOpenChange={setMissedOpen}
        trainingId={entry.id}
        onDone={(reason) => { onUpdate({ ...entry, status: 'faltou', cancelledReason: reason, cancelledAt: new Date().toISOString() }); setMissedOpen(false); }}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trainingId={entry.id}
        playerId={entry.playerId}
        onDeleted={() => { onDelete(entry.id); setDeleteOpen(false); }}
      />
      <CoachLinkDialog
        open={coachOpen}
        onOpenChange={setCoachOpen}
        playerId={entry.playerId}
        existingTrainingId={entry.id}
        defaultDate={entry.trainingDate}
        defaultEscalao={entry.escalao}
        onCreated={(url, expiresAt) => { onShareLink(entry.id, url, expiresAt); setCoachOpen(false); }}
      />
    </div>
  );
}

/* ───────────── Schedule Form (agendar 1 ou N treinos por datas específicas) ───────────── */

type DateSlot = { date: string; time: string };

function ScheduleForm({ playerId, defaultEscalao, onDone }: {
  playerId: number; defaultEscalao?: string | null; onDone: (entries: TFeedback[]) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [slots, setSlots] = useState<DateSlot[]>([{ date: today, time: '10:00' }]);
  const [location, setLocation] = useState('');
  const [escalao, setEscalao] = useState(defaultEscalao ?? '');
  const [isPending, startTransition] = useTransition();

  function updateSlot(i: number, patch: Partial<DateSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    const last = slots[slots.length - 1];
    // Default new date = last + 1 day, same time
    const next = new Date(last.date + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    setSlots((prev) => [...prev, { date: next.toISOString().slice(0, 10), time: last.time }]);
  }

  function removeSlot(i: number) {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  const validSlots = slots.filter((s) => s.date);
  const canSubmit = validSlots.length > 0 && !isPending;
  const ctaLabel = validSlots.length === 1
    ? 'Agendar treino'
    : `Agendar ${validSlots.length} treinos`;

  function handleSubmit() {
    if (validSlots.length === 0) { toast.error('Adiciona pelo menos uma data'); return; }
    startTransition(async () => {
      const created: TFeedback[] = [];
      for (const slot of validSlots) {
        const res = await scheduleTraining({
          playerId,
          trainingDate: slot.date,
          sessionTime: slot.time || undefined,
          location: location || undefined,
          escalao: escalao || undefined,
        });
        if (!res.success) {
          toast.error(`Erro: ${res.error}`);
          continue;
        }
        created.push({
          id: res.data!.trainingId,
          clubId: '', playerId, authorId: null, authorName: 'Eu',
          trainingDate: slot.date, escalao: escalao || null,
          status: 'agendado', sessionTime: slot.time || null, location: location || null,
          observedPosition: null, isRetroactive: false, cancelledAt: null, cancelledReason: null,
          presence: 'attended',
          feedback: null, rating: null, ratingPerformance: null, ratingPotential: null,
          decision: 'sem_decisao',
          heightScale: null, buildScale: null, speedScale: null, intensityScale: null,
          maturation: null, tags: [],
          coachFeedback: null, coachRating: null, coachRatingPerformance: null, coachRatingPotential: null,
          coachDecision: null, coachHeightScale: null, coachBuildScale: null, coachSpeedScale: null,
          coachIntensityScale: null, coachMaturation: null, coachTags: [], coachObservedPosition: null,
          coachName: null, coachSubmittedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }
      if (created.length > 0) {
        toast.success(created.length === 1 ? 'Treino agendado' : `${created.length} treinos agendados`);
        onDone(created);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Datas — lista explícita, cada linha é 1 treino */}
      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-800">Quando?</p>
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <Calendar className="h-4 w-4 shrink-0 text-neutral-400" />
                <input type="date" value={slot.date}
                  onChange={(e) => updateSlot(i, { date: e.target.value })}
                  className="flex-1 bg-transparent text-sm outline-none" />
                <span className="text-neutral-300">·</span>
                <input type="time" value={slot.time}
                  onChange={(e) => updateSlot(i, { time: e.target.value })}
                  className="w-20 bg-transparent text-sm outline-none" />
              </div>
              {slots.length > 1 && (
                <button type="button" onClick={() => removeSlot(i)}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600 transition">
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addSlot}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50">
          <Plus className="h-3.5 w-3.5" />
          Adicionar outra data
        </button>
      </div>

      {/* Detalhes comuns */}
      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-800">Detalhes</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <GraduationCap className="h-4 w-4 shrink-0 text-neutral-400" />
            <input type="text" value={escalao} onChange={(e) => setEscalao(e.target.value)}
              placeholder="Escalão"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Local (opcional)"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Submit — sticky bottom feel */}
      <button type="button" onClick={handleSubmit} disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500">
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A agendar...</> : <><Calendar className="h-4 w-4" /> {ctaLabel}</>}
      </button>
    </div>
  );
}

/* ───────────── Register Past Form (retroactivo) — visual igual ao CoachFeedbackForm ───────────── */

const NEGATIVE_TAGS = new Set(['perde_muitas_bolas', 'agarrado_bola', 'trapalhao', 'sem_nocao_espaco', 'desorientado', 'timido', 'nervoso', 'agressivo', 'desligado', 'dificuldade_contexto', 'nivel_abaixo']);

function RegisterPastForm({ playerId, defaultEscalao, onDone }: {
  playerId: number; defaultEscalao?: string | null; onDone: (entry: TFeedback) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [escalao, setEscalao] = useState(defaultEscalao ?? '');
  const [location, setLocation] = useState('');
  const [observedPositions, setObservedPositions] = useState<string[]>([]);
  const [ratingPerformance, setRatingPerformance] = useState<number | null>(null);
  const [ratingPotential, setRatingPotential] = useState<number | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [heightScale, setHeightScale] = useState<string | null>(null);
  const [buildScale, setBuildScale] = useState<string | null>(null);
  const [speedScale, setSpeedScale] = useState<string | null>(null);
  const [intensityScale, setIntensityScale] = useState<string | null>(null);
  const [maturation, setMaturation] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  const canSubmit = !!date
    && observedPositions.length > 0
    && ratingPerformance !== null
    && ratingPotential !== null
    && decision !== null
    && feedback.trim().length > 0
    && !isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await registerPastTraining({
        playerId,
        trainingDate: date,
        escalao: escalao || undefined,
        location: location || undefined,
        observedPosition: observedPositions.join(',') || undefined,
        feedback: feedback.trim() || undefined,
        ratingPerformance: ratingPerformance ?? undefined,
        ratingPotential: ratingPotential ?? undefined,
        decision: decision ?? 'sem_decisao',
        heightScale: heightScale as HeightScale | null,
        buildScale: buildScale as BuildScale | null,
        speedScale: speedScale as SpeedScale | null,
        intensityScale: intensityScale as IntensityScale | null,
        maturation: maturation as MaturationScale | null,
        tags,
      });
      if (res.success && res.data) {
        toast.success('Treino registado');
        onDone({
          id: res.data.trainingId, clubId: '', playerId, authorId: null, authorName: 'Eu',
          trainingDate: date, escalao: escalao || null,
          status: 'realizado', sessionTime: null, location: location || null,
          observedPosition: observedPositions.join(',') || null,
          isRetroactive: true, cancelledAt: null, cancelledReason: null,
          presence: 'attended', feedback: feedback.trim() || null,
          rating: ratingPerformance, ratingPerformance, ratingPotential,
          decision: (decision ?? 'sem_decisao') as TrainingDecision,
          heightScale: heightScale as HeightScale | null,
          buildScale: buildScale as BuildScale | null,
          speedScale: speedScale as SpeedScale | null,
          intensityScale: intensityScale as IntensityScale | null,
          maturation: maturation as MaturationScale | null,
          tags,
          coachFeedback: null, coachRating: null, coachRatingPerformance: null, coachRatingPotential: null,
          coachDecision: null, coachHeightScale: null, coachBuildScale: null, coachSpeedScale: null,
          coachIntensityScale: null, coachMaturation: null, coachTags: [], coachObservedPosition: null,
          coachName: null, coachSubmittedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Data / Escalão / Local (Data obrigatória) ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormSectionLabel required>Data do treino</FormSectionLabel>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 outline-none focus:ring-1 focus:ring-neutral-300" />
        </div>
        <div>
          <FormSectionLabel>Escalão</FormSectionLabel>
          <input type="text" value={escalao} onChange={(e) => setEscalao(e.target.value)}
            placeholder="Ex: Sub-15"
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300" />
        </div>
      </div>
      <div>
        <FormSectionLabel>Local</FormSectionLabel>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
          placeholder="Campo 1 (opcional)"
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300" />
      </div>

      {/* ── Posição observada ── */}
      <div>
        <FormSectionLabel required info="Em que posição jogou o atleta durante o treino">Posição observada</FormSectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'].map((pos) => (
            <button key={pos} type="button"
              onClick={() => setObservedPositions((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos])}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                observedPositions.includes(pos) ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200')}>
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* ── Dual Rating — lado a lado, compacto ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <FormSectionLabelInline required info="Jogador de rendimento — pronto para contribuir já">Rendimento</FormSectionLabelInline>
            {ratingPerformance && (
              <span className={cn('text-[10px] font-bold uppercase', (RATING_FULL_COLORS[ratingPerformance] ?? DEFAULT_STAR_COLORS).text)}>
                {RATING_WORD_LABELS[ratingPerformance]}
              </span>
            )}
          </div>
          <StarRatingBar rating={ratingPerformance} onChange={setRatingPerformance} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <FormSectionLabelInline required info="Jogador de potencial — pode evoluir muito com tempo e contexto">Potencial</FormSectionLabelInline>
            {ratingPotential && (
              <span className={cn('text-[10px] font-bold uppercase', (RATING_FULL_COLORS[ratingPotential] ?? DEFAULT_STAR_COLORS).text)}>
                {RATING_WORD_LABELS[ratingPotential]}
              </span>
            )}
          </div>
          <StarRatingBar rating={ratingPotential} onChange={setRatingPotential} />
        </div>
      </div>

      {/* ── Decisão ── */}
      <div>
        <FormSectionLabel required info="Assinar = queremos · Repetir = outro treino · Dúvidas = precisa avaliar · Descartar = não interessa">Decisão</FormSectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {COACH_DECISIONS.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => setDecision(decision === opt.value ? null : opt.value)}
              className={cn('rounded-xl border py-2.5 text-sm font-semibold transition text-center',
                decision === opt.value ? opt.colorActive : 'border-neutral-200 text-neutral-500 hover:border-neutral-400')}>
              {decision === opt.value && <span className="mr-1">{opt.icon}</span>}
              {opt.labelPt}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feedback text ── */}
      <div>
        <FormSectionLabel required>Feedback</FormSectionLabel>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4}
          placeholder="Como correu o treino do jogador..."
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300" />
      </div>

      {/* ── Físico ── */}
      <div className="rounded-xl border border-l-[3px] border-l-cyan-400 bg-neutral-50/50 p-3 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-600">⚡ Físico</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ScaleRowCyan label="Estatura" options={HEIGHT_SCALE_OPTIONS} value={heightScale} onChange={setHeightScale} info="Alto = acima da média · Normal = na média · Baixo = abaixo" />
          <ScaleRowCyan label="Corpo" options={BUILD_SCALE_OPTIONS} value={buildScale} onChange={setBuildScale} info="Ecto = magro/longilíneo · Meso = atlético · Endo = robusto" />
          <ScaleRowCyan label="Velocidade" options={SPEED_SCALE_OPTIONS} value={speedScale} onChange={setSpeedScale} info="Rápido = destaca-se · Normal = na média · Lento = abaixo" />
          <ScaleRowCyan label="Intensidade" options={INTENSITY_SCALE_OPTIONS} value={intensityScale} onChange={setIntensityScale} info="Intenso = esforço máximo · Pouco = baixa energia" />
        </div>
        <ScaleRowCyan label="Maturação" options={MATURATION_SCALE_OPTIONS} value={maturation} onChange={setMaturation} info="Nada = pré-pubertário · Início = início do pico · Maturado = pico atingido · Super = muito avançado" />
      </div>

      {/* ── Tags ── */}
      {TRAINING_TAG_CATEGORIES.map((cat) => {
        const catStyle = cat.category === 'tecnica' ? { border: 'border-l-blue-400', label: 'text-blue-600', emoji: '⚽' }
          : cat.category === 'tatico' ? { border: 'border-l-teal-400', label: 'text-teal-600', emoji: '🧩' }
          : cat.category === 'mental' ? { border: 'border-l-purple-400', label: 'text-purple-600', emoji: '🧠' }
          : { border: 'border-l-amber-400', label: 'text-amber-600', emoji: '🔄' };
        return (
          <div key={cat.category} className={cn('rounded-xl border border-l-[3px] bg-neutral-50/50 p-3', catStyle.border)}>
            <p className={cn('mb-2 text-[11px] font-bold uppercase tracking-widest', catStyle.label)}>{catStyle.emoji} {cat.labelPt}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.tags.map((tag) => {
                const selected = tags.includes(tag.value);
                return (
                  <button key={tag.value} type="button" onClick={() => toggleTag(tag.value)}
                    className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition',
                      selected
                        ? (NEGATIVE_TAGS.has(tag.value) ? 'bg-red-100 text-red-700 border border-red-300 shadow-sm' : 'bg-green-100 text-green-700 border border-green-300 shadow-sm')
                        : 'border border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400')}>
                    {tag.labelPt}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Submit ── */}
      <button type="button" onClick={handleSubmit} disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500">
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A guardar...</> : 'Registar treino'}
      </button>

      {!canSubmit && !isPending && (
        <p className="text-center text-[10px] text-neutral-400">Preenche data, posição, avaliações, decisão e feedback.</p>
      )}
    </div>
  );
}

/* ───────────── FormSectionLabel (igual ao CoachFeedbackForm) ───────────── */

function FormSectionLabel({ children, required, info }: { children: React.ReactNode; required?: boolean; info?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1">
      <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
        {children}
        {required && <span className="ml-1 text-red-400">*</span>}
      </p>
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

/** Label inline (sem margem, para usar dentro de containers com word-label à direita) */
function FormSectionLabelInline({ children, required, info }: { children: React.ReactNode; required?: boolean; info?: string }) {
  return (
    <div className="flex items-center gap-1">
      <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
        {children}
        {required && <span className="ml-1 text-red-400">*</span>}
      </p>
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

/* ───────────── ScaleRowCyan (igual ao CoachFeedbackForm) ───────────── */

function ScaleRowCyan({ label, options, value, onChange, info }: {
  label: string;
  options: readonly { value: string; labelPt: string }[];
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
      <div className="flex h-8 gap-0.5 rounded-lg overflow-hidden">
        {options.map((opt, i) => (
          <button key={opt.value} type="button"
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={cn('flex-1 flex items-center justify-center text-xs font-semibold transition-all active:scale-95',
              value === opt.value ? 'bg-cyan-600 text-white' : 'bg-neutral-200/60 text-neutral-500 hover:bg-neutral-200',
              i === 0 && 'rounded-l-lg',
              i === options.length - 1 && 'rounded-r-lg')}>
            {opt.labelPt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── StarRatingBar (igual ao CoachFeedbackForm) ───────────── */

const RATING_FULL_COLORS: Record<number, { star: string; text: string; bg: string }> = {
  1: { star: 'text-red-500', text: 'text-red-600', bg: 'bg-red-50' },
  2: { star: 'text-orange-400', text: 'text-orange-600', bg: 'bg-orange-50' },
  3: { star: 'text-blue-400', text: 'text-blue-600', bg: 'bg-blue-50' },
  4: { star: 'text-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  5: { star: 'text-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};
const DEFAULT_STAR_COLORS = { star: 'text-neutral-300', text: 'text-neutral-500', bg: 'bg-neutral-50' };
const RATING_WORD_LABELS: Record<number, string> = { 1: 'Fraco', 2: 'Dúvida', 3: 'Bom', 4: 'Muito Bom', 5: 'Excelente' };

function StarRatingBar({ rating, onChange }: { rating: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex h-10 gap-0.5 rounded-xl overflow-hidden">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = rating !== null && n <= rating;
        const c = RATING_FULL_COLORS[rating ?? 0] ?? DEFAULT_STAR_COLORS;
        return (
          <button key={n} type="button"
            onClick={() => onChange(rating === n ? null : n)}
            className={cn('flex-1 flex items-center justify-center text-xs font-bold transition-all active:scale-95',
              active ? `${c.bg} ${c.text}` : 'bg-neutral-100 text-neutral-300 hover:bg-neutral-200',
              n === 1 && 'rounded-l-xl',
              n === 5 && 'rounded-r-xl')}>
            <Star className={cn('h-4 w-4', active ? c.star : 'text-neutral-300')} fill={active ? 'currentColor' : 'none'} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Evaluate Dialog (preencher avaliação de treino existente) ───────────── */

function EvaluateDialog({ open, onOpenChange, entry, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  entry: TFeedback; onSaved: (e: TFeedback) => void;
}) {
  const [feedback, setFeedback] = useState(entry.feedback ?? '');
  const [ratingPerformance, setRatingPerformance] = useState<number | null>(entry.ratingPerformance);
  const [ratingPotential, setRatingPotential] = useState<number | null>(entry.ratingPotential);
  const [decision, setDecision] = useState<string | null>(
    entry.decision && entry.decision !== 'sem_decisao' ? entry.decision : null,
  );
  const [heightScale, setHeightScale] = useState<string | null>(entry.heightScale);
  const [buildScale, setBuildScale] = useState<string | null>(entry.buildScale);
  const [speedScale, setSpeedScale] = useState<string | null>(entry.speedScale);
  const [intensityScale, setIntensityScale] = useState<string | null>(entry.intensityScale);
  const [maturation, setMaturation] = useState<string | null>(entry.maturation);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [observedPositions, setObservedPositions] = useState<string[]>(
    entry.observedPosition ? entry.observedPosition.split(',').map((p) => p.trim()).filter(Boolean) : [],
  );
  const [isPending, startTransition] = useTransition();

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  const canSubmit = observedPositions.length > 0
    && ratingPerformance !== null
    && ratingPotential !== null
    && decision !== null
    && feedback.trim().length > 0
    && !isPending;

  function handleSave() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await updateTrainingEvaluation({
        trainingId: entry.id,
        feedback: feedback.trim() || undefined,
        ratingPerformance,
        ratingPotential,
        decision: decision ?? 'sem_decisao',
        heightScale: heightScale as HeightScale | null,
        buildScale: buildScale as BuildScale | null,
        speedScale: speedScale as SpeedScale | null,
        intensityScale: intensityScale as IntensityScale | null,
        maturation: maturation as MaturationScale | null,
        tags,
        observedPosition: observedPositions.join(',') || undefined,
      });
      if (res.success) {
        toast.success('Avaliação guardada');
        onSaved({
          ...entry,
          status: entry.status === 'agendado' ? 'realizado' : entry.status,
          feedback: feedback.trim() || null,
          ratingPerformance, ratingPotential,
          decision: (decision ?? 'sem_decisao') as TrainingDecision,
          heightScale: heightScale as HeightScale | null,
          buildScale: buildScale as BuildScale | null,
          speedScale: speedScale as SpeedScale | null,
          intensityScale: intensityScale as IntensityScale | null,
          maturation: maturation as MaturationScale | null,
          tags,
          observedPosition: observedPositions.join(',') || null,
        });
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  const dateLabel = new Date(entry.trainingDate).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Avaliação do treino</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Context header — data e escalão fixos (não editáveis aqui) */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
            <span className="font-medium text-neutral-700">{dateLabel}</span>
            {entry.sessionTime && <span>· {entry.sessionTime.slice(0, 5)}</span>}
            {entry.escalao && <span>· {entry.escalao}</span>}
            {entry.location && <span>· {entry.location}</span>}
          </div>

          {/* ── Posição observada ── */}
          <div>
            <FormSectionLabel required info="Em que posição jogou o atleta durante o treino">Posição observada</FormSectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'].map((pos) => (
                <button key={pos} type="button"
                  onClick={() => setObservedPositions((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos])}
                  className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                    observedPositions.includes(pos) ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200')}>
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* ── Dual Rating ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <FormSectionLabelInline required info="Jogador de rendimento — pronto para contribuir já">Rendimento</FormSectionLabelInline>
                {ratingPerformance && (
                  <span className={cn('text-[10px] font-bold uppercase', (RATING_FULL_COLORS[ratingPerformance] ?? DEFAULT_STAR_COLORS).text)}>
                    {RATING_WORD_LABELS[ratingPerformance]}
                  </span>
                )}
              </div>
              <StarRatingBar rating={ratingPerformance} onChange={setRatingPerformance} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <FormSectionLabelInline required info="Jogador de potencial — pode evoluir muito com tempo e contexto">Potencial</FormSectionLabelInline>
                {ratingPotential && (
                  <span className={cn('text-[10px] font-bold uppercase', (RATING_FULL_COLORS[ratingPotential] ?? DEFAULT_STAR_COLORS).text)}>
                    {RATING_WORD_LABELS[ratingPotential]}
                  </span>
                )}
              </div>
              <StarRatingBar rating={ratingPotential} onChange={setRatingPotential} />
            </div>
          </div>

          {/* ── Decisão ── */}
          <div>
            <FormSectionLabel required info="Assinar = queremos · Repetir = outro treino · Dúvidas = precisa avaliar · Descartar = não interessa">Decisão</FormSectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {COACH_DECISIONS.map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => setDecision(decision === opt.value ? null : opt.value)}
                  className={cn('rounded-xl border py-2.5 text-sm font-semibold transition text-center',
                    decision === opt.value ? opt.colorActive : 'border-neutral-200 text-neutral-500 hover:border-neutral-400')}>
                  {decision === opt.value && <span className="mr-1">{opt.icon}</span>}
                  {opt.labelPt}
                </button>
              ))}
            </div>
          </div>

          {/* ── Feedback text ── */}
          <div>
            <FormSectionLabel required>Feedback</FormSectionLabel>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4}
              placeholder="Como correu o treino do jogador..."
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-neutral-700 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-neutral-300" />
          </div>

          {/* ── Físico ── */}
          <div className="rounded-xl border border-l-[3px] border-l-cyan-400 bg-neutral-50/50 p-3 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-600">⚡ Físico</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <ScaleRowCyan label="Estatura" options={HEIGHT_SCALE_OPTIONS} value={heightScale} onChange={setHeightScale} info="Alto = acima da média · Normal = na média · Baixo = abaixo" />
              <ScaleRowCyan label="Corpo" options={BUILD_SCALE_OPTIONS} value={buildScale} onChange={setBuildScale} info="Ecto = magro/longilíneo · Meso = atlético · Endo = robusto" />
              <ScaleRowCyan label="Velocidade" options={SPEED_SCALE_OPTIONS} value={speedScale} onChange={setSpeedScale} info="Rápido = destaca-se · Normal = na média · Lento = abaixo" />
              <ScaleRowCyan label="Intensidade" options={INTENSITY_SCALE_OPTIONS} value={intensityScale} onChange={setIntensityScale} info="Intenso = esforço máximo · Pouco = baixa energia" />
            </div>
            <ScaleRowCyan label="Maturação" options={MATURATION_SCALE_OPTIONS} value={maturation} onChange={setMaturation} info="Nada = pré-pubertário · Início = início do pico · Maturado = pico atingido · Super = muito avançado" />
          </div>

          {/* ── Tags ── */}
          {TRAINING_TAG_CATEGORIES.map((cat) => {
            const catStyle = cat.category === 'tecnica' ? { border: 'border-l-blue-400', label: 'text-blue-600', emoji: '⚽' }
              : cat.category === 'tatico' ? { border: 'border-l-teal-400', label: 'text-teal-600', emoji: '🧩' }
              : cat.category === 'mental' ? { border: 'border-l-purple-400', label: 'text-purple-600', emoji: '🧠' }
              : { border: 'border-l-amber-400', label: 'text-amber-600', emoji: '🔄' };
            return (
              <div key={cat.category} className={cn('rounded-xl border border-l-[3px] bg-neutral-50/50 p-3', catStyle.border)}>
                <p className={cn('mb-2 text-[11px] font-bold uppercase tracking-widest', catStyle.label)}>{catStyle.emoji} {cat.labelPt}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.tags.map((tag) => {
                    const selected = tags.includes(tag.value);
                    return (
                      <button key={tag.value} type="button" onClick={() => toggleTag(tag.value)}
                        className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition',
                          selected
                            ? (NEGATIVE_TAGS.has(tag.value) ? 'bg-red-100 text-red-700 border border-red-300 shadow-sm' : 'bg-green-100 text-green-700 border border-green-300 shadow-sm')
                            : 'border border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400')}>
                        {tag.labelPt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <button type="button" onClick={handleSave} disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500">
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A guardar...</> : 'Guardar avaliação'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Edit Training Dialog (data / hora / local / escalão) ───────────── */

function EditTrainingDialog({ open, onOpenChange, entry, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  entry: TFeedback; onSaved: (e: TFeedback) => void;
}) {
  const [date, setDate] = useState(entry.trainingDate);
  const [time, setTime] = useState(entry.sessionTime ? entry.sessionTime.slice(0, 5) : '10:00');
  const [location, setLocation] = useState(entry.location ?? '');
  const [escalao, setEscalao] = useState(entry.escalao ?? '');
  const [isPending, startTransition] = useTransition();

  // Sync state quando o entry muda externamente (realtime / outro user)
  /* eslint-disable react-hooks/set-state-in-effect -- sync controlled inputs com entry externamente actualizado */
  useEffect(() => {
    setDate(entry.trainingDate);
    setTime(entry.sessionTime ? entry.sessionTime.slice(0, 5) : '10:00');
    setLocation(entry.location ?? '');
    setEscalao(entry.escalao ?? '');
  }, [entry.trainingDate, entry.sessionTime, entry.location, entry.escalao]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasChanges =
    date !== entry.trainingDate
    || time !== (entry.sessionTime?.slice(0, 5) ?? '10:00')
    || location !== (entry.location ?? '')
    || escalao !== (entry.escalao ?? '');

  function handleSave() {
    if (!date) { toast.error('Data obrigatória'); return; }
    if (!hasChanges) { onOpenChange(false); return; }
    startTransition(async () => {
      const res = await rescheduleTraining({
        trainingId: entry.id,
        trainingDate: date,
        sessionTime: time || undefined,
        location: location || undefined,
        escalao: escalao || undefined,
      });
      if (res.success) {
        toast.success('Treino actualizado');
        onSaved({
          ...entry,
          trainingDate: date,
          sessionTime: time || null,
          location: location || null,
          escalao: escalao || null,
        });
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar treino</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
              <Calendar className="h-4 w-4 shrink-0 text-neutral-400" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
              <span className="text-neutral-400 text-xs">⏰</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
              <GraduationCap className="h-4 w-4 shrink-0 text-neutral-400" />
              <input type="text" value={escalao} onChange={(e) => setEscalao(e.target.value)}
                placeholder="Escalão"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="Local (opc.)"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onOpenChange(false)} disabled={isPending}
              className="rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={isPending || !date}
              className="rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500">
              {isPending ? 'A guardar...' : hasChanges ? 'Guardar' : 'Sem alterações'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Cancel Dialog ───────────── */

function CancelDialog({ open, onOpenChange, trainingId, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  trainingId: number; onDone: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const res = await cancelTraining({ trainingId, reason: reason || undefined });
      if (res.success) {
        toast.success('Treino cancelado');
        onDone(reason);
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar treino?</AlertDialogTitle>
          <AlertDialogDescription>O treino será marcado como cancelado. O event no calendário é apagado.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label>Motivo (opcional)</Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Ex: Família desistiu, doença..."
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending} className="bg-red-600 text-white hover:bg-red-700">
            {isPending ? 'A cancelar...' : 'Cancelar treino'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ───────────── Missed Dialog ───────────── */

function MissedDialog({ open, onOpenChange, trainingId, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  trainingId: number; onDone: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const res = await markTrainingMissed(trainingId, reason || undefined);
      if (res.success) {
        toast.success('Marcado como faltou');
        onDone(reason);
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Atleta faltou?</AlertDialogTitle>
          <AlertDialogDescription>Marca este treino como &ldquo;faltou&rdquo;. Calendar event é apagado.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label>Motivo (opcional)</Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending} className="bg-red-600 text-white hover:bg-red-700">
            {isPending ? 'A guardar...' : 'Marcar faltou'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ───────────── Delete Confirm Dialog ───────────── */

function DeleteConfirmDialog({ open, onOpenChange, trainingId, playerId, onDeleted }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  trainingId: number; playerId: number; onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteTrainingFeedback(trainingId, playerId);
      if (res.success) {
        toast.success('Treino apagado');
        onDeleted();
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar treino?</AlertDialogTitle>
          <AlertDialogDescription>A avaliação (se houver) também é apagada. Não pode ser revertido.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-red-600 text-white hover:bg-red-700">
            {isPending ? 'A apagar...' : 'Apagar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ───────────── Coach Link Dialog ───────────── */

function CoachLinkDialog({ open, onOpenChange, playerId, existingTrainingId, defaultDate, defaultEscalao, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  playerId: number; existingTrainingId?: number; defaultDate: string; defaultEscalao: string | null;
  onCreated: (url: string, expiresAt: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    startTransition(async () => {
      const res = await createCoachFeedbackLink(playerId, defaultDate, defaultEscalao ?? undefined, existingTrainingId);
      if (res.success && res.data) {
        setUrl(res.data.url);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        onCreated(res.data.url, expiresAt);
        try {
          await navigator.clipboard.writeText(res.data.url);
          toast.success('Link copiado!');
        } catch {
          toast.success('Link gerado');
        }
      } else {
        toast.error(res.error ?? 'Erro');
      }
    });
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Cópia bloqueada — selecciona manualmente');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Pedir feedback ao treinador</DialogTitle></DialogHeader>
        {url ? (
          <div className="space-y-3">
            <input type="text" value={url} readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border bg-neutral-50 px-3 py-2 text-xs" />
            <div className="flex gap-2">
              <button type="button" onClick={handleCopy}
                className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium',
                  copied ? 'border-green-300 bg-green-50 text-green-600' : 'border-neutral-200')}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium">
                <ExternalLink className="h-4 w-4" /> Abrir
              </a>
            </div>
            <p className="text-center text-[10px] text-neutral-400">Válido por 7 dias</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Gera um link para o treinador preencher a avaliação sem precisar de conta.
            </p>
            <button type="button" onClick={handleGenerate} disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-sm font-semibold text-white">
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> A gerar...</> : <><Share2 className="h-4 w-4" /> Gerar link</>}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Small UI helpers ───────────── */

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">{children}</p>;
}

/* ───────────── Share Link Actions ───────────── */

function ShareLinkActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Cópia bloqueada');
    }
  }
  return (
    <>
      <button type="button" onClick={handleCopy}
        className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
          copied ? 'border-green-300 bg-green-50 text-green-600' : 'border-neutral-200 bg-neutral-100 text-neutral-600')}>
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
        {copied ? 'Copiado!' : 'Copiar link'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-full bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
        <ExternalLink className="h-2.5 w-2.5" /> Abrir
      </a>
    </>
  );
}
