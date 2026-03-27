// src/app/observacoes/ObservacoesClient.tsx
// Client component for scouting round management — list, create, edit, delete, status changes
// Admin/editor see full CRUD; scouts see read-only list of published rounds
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/lib/types/index.ts, src/app/observacoes/page.tsx

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Binoculars, Calendar, Check, ChevronRight, Crosshair, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createScoutingRound,
  updateScoutingRound,
  updateRoundStatus,
  deleteScoutingRound,
} from '@/actions/scouting-rounds';
import type { GameObservationTarget, ScoutAvailability, ScoutingRound, ScoutingRoundStatus, UserRole } from '@/lib/types';
import { addAvailability, removeAvailability } from '@/actions/scout-availability';
import { Clock, Sun } from 'lucide-react';
import type { AssignedGame } from '@/actions/scout-assignments';
import { QuickReportForm } from '@/components/players/QuickReportForm';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

/* ───────────── Constants ───────────── */

const STATUS_CONFIG: Record<ScoutingRoundStatus, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  published: { label: 'Publicada', color: 'bg-green-50 text-green-700 border-green-200' },
  closed: { label: 'Fechada', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/* ───────────── Component ───────────── */

export function ObservacoesClient({ rounds: initialRounds, userRole, scoutGames = [], scoutTargets = {}, scoutAvailability = {} }: {
  rounds: ScoutingRound[];
  userRole: UserRole;
  scoutGames?: AssignedGame[];
  scoutTargets?: Record<number, GameObservationTarget[]>;
  scoutAvailability?: Record<number, ScoutAvailability[]>;
}) {
  const [rounds, setRounds] = useState(initialRounds);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRound, setEditRound] = useState<ScoutingRound | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScoutingRound | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = userRole === 'admin' || userRole === 'editor';
  const canDelete = userRole === 'admin';

  function handleStatusChange(round: ScoutingRound, newStatus: ScoutingRoundStatus) {
    startTransition(async () => {
      const res = await updateRoundStatus(round.id, newStatus);
      if (res.success) {
        setRounds((prev) => prev.map((r) => r.id === round.id ? { ...r, status: newStatus } : r));
        toast.success(`Jornada ${STATUS_CONFIG[newStatus].label.toLowerCase()}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete(round: ScoutingRound) {
    startTransition(async () => {
      const res = await deleteScoutingRound(round.id);
      if (res.success) {
        setRounds((prev) => prev.filter((r) => r.id !== round.id));
        setDeleteTarget(null);
        toast.success('Jornada eliminada');
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 sm:text-xl">Observações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rounds.length} jornada{rounds.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nova Jornada
          </Button>
        )}
      </div>

      {/* Round list */}
      {rounds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Binoculars className="h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-500">Sem jornadas de observação</p>
          {canManage && (
            <p className="mt-1 text-xs text-muted-foreground">Cria a primeira jornada para começar</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rounds.map((round) => {
            if (!canManage) {
              // Scout view — collapsible inline with assigned games
              const roundGames = scoutGames.filter((g) => g.roundId === round.id);
              return (
                <ScoutRoundCard
                  key={round.id}
                  round={round}
                  games={roundGames}
                  targets={scoutTargets}
                  initialAvailability={scoutAvailability[round.id] ?? []}
                />
              );
            }
            return (
              <RoundCard
                key={round.id}
                round={round}
                canManage={canManage}
                canDelete={canDelete}
                isPending={isPending}
                onEdit={() => setEditRound(round)}
                onDelete={() => setDeleteTarget(round)}
                onStatusChange={(status) => handleStatusChange(round, status)}
              />
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Jornada</DialogTitle>
          </DialogHeader>
          <RoundForm
            onSubmit={(data) => {
              startTransition(async () => {
                const res = await createScoutingRound(data);
                if (res.success && res.data) {
                  setRounds((prev) => [res.data!, ...prev]);
                  setCreateOpen(false);
                  toast.success('Jornada criada');
                } else {
                  toast.error(res.error);
                }
              });
            }}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editRound} onOpenChange={(open) => !open && setEditRound(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Jornada</DialogTitle>
          </DialogHeader>
          {editRound && (
            <RoundForm
              initial={editRound}
              onSubmit={(data) => {
                startTransition(async () => {
                  const res = await updateScoutingRound(editRound.id, data);
                  if (res.success) {
                    setRounds((prev) => prev.map((r) => r.id === editRound.id ? { ...r, ...data } : r));
                    setEditRound(null);
                    toast.success('Jornada atualizada');
                  } else {
                    toast.error(res.error);
                  }
                });
              }}
              isPending={isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; e todos os jogos e atribuições associados serão eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isPending}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Round Card ───────────── */

/* ───────────── Inline Availability Form (same as RoundDetailClient) ───────────── */

type AvailType = 'always' | 'full_day' | 'period' | 'time_range';
type AvailPeriod = 'morning' | 'afternoon' | 'evening';

const AVAIL_TYPES: { value: AvailType; label: string; icon: typeof Check }[] = [
  { value: 'always', label: 'Sempre disponível', icon: Check },
  { value: 'full_day', label: 'Dia inteiro', icon: Calendar },
  { value: 'period', label: 'Período', icon: Sun },
  { value: 'time_range', label: 'Hora exacta', icon: Clock },
];

const AVAIL_PERIODS: { value: AvailPeriod; label: string }[] = [
  { value: 'morning', label: 'Manhã' },
  { value: 'afternoon', label: 'Tarde' },
  { value: 'evening', label: 'Noite' },
];

function InlineAvailForm({ roundId, roundDays, isPending, onSubmit, onClose }: {
  roundId: number;
  roundDays: string[];
  isPending: boolean;
  onSubmit: (data: { roundId: number; availabilityType: string; availableDate?: string; period?: string; timeStart?: string; timeEnd?: string; notes?: string }) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<AvailType>('full_day');
  const [date, setDate] = useState(roundDays[0] ?? '');
  const [period, setPeriod] = useState<AvailPeriod>('morning');
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('12:00');
  const [notes, setNotes] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          roundId,
          availabilityType: type,
          availableDate: type !== 'always' ? date : undefined,
          period: type === 'period' ? period : undefined,
          timeStart: type === 'time_range' ? timeStart : undefined,
          timeEnd: type === 'time_range' ? timeEnd : undefined,
          notes: notes || undefined,
        });
      }}
      className="space-y-3"
    >
      {/* Type selector */}
      <div>
        <label className="mb-1 block text-[10px] font-medium text-neutral-500">Tipo</label>
        <div className="grid grid-cols-2 gap-1.5">
          {AVAIL_TYPES.map((opt) => {
            const Icon = opt.icon;
            return (
              <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition',
                  type === opt.value ? 'border-green-300 bg-green-50 text-green-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50')}>
                <Icon className="h-3.5 w-3.5 shrink-0" />{opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date */}
      {type !== 'always' && (
        <div>
          <label className="mb-1 block text-[10px] font-medium text-neutral-500">Dia</label>
          <select value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-xs outline-none focus:border-neutral-400">
            {roundDays.map((day) => {
              const [y, m, d] = day.split('-');
              return <option key={day} value={day}>{d}/{m}</option>;
            })}
          </select>
        </div>
      )}

      {/* Period */}
      {type === 'period' && (
        <div>
          <label className="mb-1 block text-[10px] font-medium text-neutral-500">Período</label>
          <div className="flex gap-1.5">
            {AVAIL_PERIODS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => setPeriod(opt.value)}
                className={cn('flex-1 rounded-lg border px-2.5 py-2 text-xs font-medium transition',
                  period === opt.value ? 'border-green-300 bg-green-50 text-green-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50')}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time range */}
      {type === 'time_range' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-neutral-500">De</label>
            <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} required
              className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-xs outline-none focus:border-neutral-400" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-neutral-500">Até</label>
            <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} required
              className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-xs outline-none focus:border-neutral-400" />
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="mb-1 block text-[10px] font-medium text-neutral-500">Notas <span className="font-normal text-neutral-400">(opcional)</span></label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 100))} maxLength={100} placeholder="Ex: Só se for perto da Sra. da Hora"
          className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-xs outline-none focus:border-neutral-400 placeholder:text-neutral-400" />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button type="button" onClick={onClose}
          className="flex-1 rounded-lg border border-neutral-200 py-2 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50">
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          className="flex-1 rounded-lg bg-neutral-900 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50">
          Confirmar
        </button>
      </div>
    </form>
  );
}

/* ───────────── Scout Round Card (collapsible inline with games) ───────────── */

function ScoutRoundCard({ round, games, targets, initialAvailability }: {
  round: ScoutingRound;
  games: AssignedGame[];
  targets: Record<number, GameObservationTarget[]>;
  initialAvailability: ScoutAvailability[];
}) {
  const [expanded, setExpanded] = useState(true);
  const router = useRouter();
  const [qsrPlayer, setQsrPlayer] = useState<{ id: number; name: string; isGk: boolean; photoUrl: string | null; club: string; position: string | null; gameId: number; game: AssignedGame } | null>(null);
  const [qsrDirty, setQsrDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [completedPlayerIds, setCompletedPlayerIds] = useState<Set<number>>(new Set());
  const [availability, setAvailability] = useState(initialAvailability);
  const [showAvailForm, setShowAvailForm] = useState(false);
  const [availPending, startAvailTransition] = useTransition();

  const statusCfg = STATUS_CONFIG[round.status];
  const startLabel = new Date(round.startDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  const endLabel = new Date(round.endDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });

  // Days in the round range (for availability form)
  const roundDays = useMemo(() => {
    const days: string[] = [];
    const [sy2, sm2, sd2] = round.startDate.split('-').map(Number);
    const cur = new Date(sy2, sm2 - 1, sd2);
    while (true) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (dateStr > round.endDate) break;
      days.push(dateStr);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [round.startDate, round.endDate]);
  const hasGames = games.length > 0;

  function shortName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/30"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{startLabel} — {endLabel}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', statusCfg.color)}>{statusCfg.label}</span>
            {hasGames && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{games.length}</span>
            )}
          </div>
          {round.name && round.name !== `${startLabel} — ${endLabel}` && (
            <p className="mt-0.5 text-xs text-muted-foreground">{round.name}</p>
          )}
        </div>
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
      </button>

      {/* Expanded: assigned games + targets */}
      {expanded && (
        <div className="border-t">
          {!hasGames ? (
            <div className="px-4 py-4 text-center text-xs text-muted-foreground">Sem jogos atribuídos nesta jornada</div>
          ) : (
            <div className="divide-y">
              {games.map((game) => {
                const gameTargets = targets[game.gameId] ?? [];
                const dateLabel = new Date(game.matchDate).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
                return (
                  <div key={game.gameId} className="px-4 py-3 space-y-2">
                    {/* Game info */}
                    <div>
                      <p className="text-sm font-semibold">
                        {game.homeTeam} <span className="font-normal text-muted-foreground">vs</span> {game.awayTeam}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {dateLabel}{game.matchTime ? ` · ${game.matchTime}` : ''}
                        {game.venue ? ` · ${game.venue}` : ''}
                        {game.escalao ? ` · ${game.escalao}` : ''}
                      </p>
                    </div>

                    {/* Targets */}
                    {gameTargets.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Relatórios pedidos</p>
                        {gameTargets.map((target) => {
                          const done = target.hasReport || completedPlayerIds.has(target.playerId);
                          return (
                            <div key={target.id} className={cn(
                              'flex items-center gap-2 rounded-lg px-2.5 py-2',
                              done ? 'bg-green-50' : 'bg-amber-50',
                            )}>
                              {done ? (
                                <Check className="h-4 w-4 shrink-0 text-green-500" />
                              ) : (
                                <Crosshair className="h-4 w-4 shrink-0 text-amber-500" />
                              )}
                              <Link href={`/jogadores/${target.playerId}`} className={cn('text-xs font-medium underline-offset-2 hover:underline', done ? 'text-green-700' : 'text-amber-800')}>
                                {shortName(target.playerName)}
                              </Link>
                              {target.playerPosition && <span className="text-[10px] text-muted-foreground">{target.playerPosition}</span>}
                              {!done && (
                                <button
                                  type="button"
                                  onClick={() => setQsrPlayer({
                                    id: target.playerId, name: target.playerName,
                                    isGk: target.playerPosition === 'GR',
                                    photoUrl: target.playerPhotoUrl,
                                    club: target.playerClub, position: target.playerPosition,
                                    gameId: game.gameId, game,
                                  })}
                                  className="ml-auto shrink-0 text-[10px] font-medium text-amber-600 hover:text-amber-500"
                                >
                                  Avaliar →
                                </button>
                              )}
                              {done && (
                                <span className="ml-auto text-[10px] text-green-600">Feito ✓</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Availability inline */}
          <div className="border-t px-4 py-2 space-y-1.5">
            {/* Show existing slots */}
            {availability.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availability.map((a) => {
                  const label = a.availabilityType === 'always' ? 'Sempre disponível'
                    : `${a.availableDate?.slice(8, 10)}/${a.availableDate?.slice(5, 7)} · ${
                      a.availabilityType === 'full_day' ? 'Dia todo'
                      : a.availabilityType === 'period' ? (a.period === 'morning' ? 'Manhã' : a.period === 'afternoon' ? 'Tarde' : 'Noite')
                      : `${a.timeStart}–${a.timeEnd}`
                    }`;
                  return (
                    <span key={a.id} className="group inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      <Check className="h-3 w-3 shrink-0" />
                      {label}
                      {round.status !== 'closed' && (
                        <button type="button" onClick={async () => {
                          setAvailability(prev => prev.filter(s => s.id !== a.id));
                          const res = await removeAvailability(a.id, round.id);
                          if (!res.success) { setAvailability(prev => [...prev, a]); toast.error(res.error ?? 'Erro'); }
                        }} className="shrink-0 rounded-full p-0.5 opacity-30 hover:opacity-100 hover:text-red-500 transition">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Notes displayed separately below pills */}
            {availability.some(a => a.notes) && (
              <div className="space-y-0.5">
                {availability.filter(a => a.notes).map(a => {
                  const dayLabel = a.availabilityType === 'always' ? '' : `${a.availableDate?.slice(8, 10)}/${a.availableDate?.slice(5, 7)}: `;
                  return (
                    <p key={`note-${a.id}`} className="text-[10px] text-muted-foreground italic">
                      {dayLabel}{a.notes}
                    </p>
                  );
                })}
              </div>
            )}
            {/* Inline availability form */}
            {round.status !== 'closed' && !showAvailForm && (
              <button
                type="button"
                onClick={() => setShowAvailForm(true)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-500 transition"
              >
                <Plus className="h-3 w-3" />
                {availability.length > 0 ? 'Editar disponibilidade' : 'Adicionar disponibilidade'}
              </button>
            )}
            {showAvailForm && (
              <div className="rounded-lg border bg-white p-3 space-y-3">
                <InlineAvailForm
                  roundId={round.id}
                  roundDays={roundDays}
                  isPending={availPending}
                  onSubmit={(data) => {
                    startAvailTransition(async () => {
                      const res = await addAvailability(data);
                      if (res.success && res.data) {
                        setAvailability(prev => [...prev, res.data!]);
                        setShowAvailForm(false);
                        toast.success('Disponibilidade adicionada');
                      } else {
                        toast.error(res.error ?? 'Erro');
                      }
                    });
                  }}
                  onClose={() => setShowAvailForm(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* QSR Dialog */}
      {qsrPlayer && (
        <Dialog open onOpenChange={(open) => {
          if (!open) {
            if (qsrDirty) { setShowDiscardConfirm(true); return; }
            setQsrPlayer(null); setQsrDirty(false);
          }
        }}>
          <DialogContent className="gap-0 max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
            <DialogHeader className="sr-only"><DialogTitle>Avaliar</DialogTitle></DialogHeader>
            <div className="flex flex-col items-center border-b bg-neutral-50 px-4 pb-4 pt-6 text-center">
              {qsrPlayer.photoUrl ? (
                <Image src={qsrPlayer.photoUrl} alt={shortName(qsrPlayer.name)} width={56} height={56} className="h-14 w-14 rounded-full border-2 border-white object-cover shadow-md" unoptimized />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-lg font-bold text-neutral-400 shadow-md">{qsrPlayer.name.charAt(0)}</div>
              )}
              <p className="mt-2 text-sm font-bold">{shortName(qsrPlayer.name)}</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {qsrPlayer.club && <span>{qsrPlayer.club}</span>}
                {qsrPlayer.club && qsrPlayer.position && <span className="text-muted-foreground/40">·</span>}
                {qsrPlayer.position && <span className="font-medium">{qsrPlayer.position}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                <span className="rounded-full border bg-white px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {qsrPlayer.game.homeTeam} vs {qsrPlayer.game.awayTeam}
                </span>
                {qsrPlayer.game.matchDate && (
                  <span className="rounded-full border bg-white px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {new Date(qsrPlayer.game.matchDate).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4">
              <QuickReportForm
                playerId={qsrPlayer.id}
                playerName={qsrPlayer.name}
                isGoalkeeper={qsrPlayer.isGk}
                initialMatchContext={{
                  competition: qsrPlayer.game.competitionName ?? undefined,
                  opponent: `${qsrPlayer.game.homeTeam} vs ${qsrPlayer.game.awayTeam}`,
                  matchDate: qsrPlayer.game.matchDate ?? undefined,
                  gameId: qsrPlayer.gameId,
                }}
                onSuccess={() => {
                  setCompletedPlayerIds(prev => new Set(prev).add(qsrPlayer.id));
                  setQsrPlayer(null); setQsrDirty(false);
                  router.refresh();
                }}
                onCancel={() => {
                  if (qsrDirty) { setShowDiscardConfirm(true); }
                  else { setQsrPlayer(null); setQsrDirty(false); }
                }}
                onDirtyChange={setQsrDirty}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Discard confirmation */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar avaliação?</AlertDialogTitle>
            <AlertDialogDescription>Tens dados preenchidos que serão perdidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDiscardConfirm(false); setQsrPlayer(null); setQsrDirty(false); }} className="bg-red-600 text-white hover:bg-red-700">
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Admin Round Card ───────────── */

function RoundCard({
  round,
  canManage,
  canDelete,
  isPending,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  round: ScoutingRound;
  canManage: boolean;
  canDelete: boolean;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: ScoutingRoundStatus) => void;
}) {
  const statusCfg = STATUS_CONFIG[round.status];
  const startLabel = new Date(round.startDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  const endLabel = new Date(round.endDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition hover:bg-accent/30">
      {/* Clickable area — icon + info navigate to detail */}
      <Link href={`/observacoes/${round.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <Calendar className="h-5 w-5" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-neutral-900">{round.name}</p>
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium', statusCfg.color)}>
              {statusCfg.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {startLabel} — {endLabel}
          </p>
          {round.notes && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{round.notes}</p>
          )}
        </div>
      </Link>

      {/* Actions — outside the Link to avoid navigation conflicts */}
      {canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-neutral-700 transition" disabled={isPending}>
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {round.status === 'draft' && (
              <DropdownMenuItem onClick={() => onStatusChange('published')}>
                Publicar
              </DropdownMenuItem>
            )}
            {round.status === 'published' && (
              <DropdownMenuItem onClick={() => onStatusChange('closed')}>
                Fechar
              </DropdownMenuItem>
            )}
            {round.status === 'closed' && (
              <DropdownMenuItem onClick={() => onStatusChange('published')}>
                Reabrir
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link href={`/observacoes/${round.id}`}>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}

/* ───────────── Round Form ───────────── */

function RoundForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial?: ScoutingRound;
  onSubmit: (data: { name: string; startDate: string; endDate: string; notes: string }) => void;
  isPending: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  // Default: next Monday → Sunday
  const nextMonday = getNextMonday();
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6);

  const [name, setName] = useState(initial?.name ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? nextMonday.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initial?.endDate ?? nextSunday.toISOString().split('T')[0]);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Auto-generate name from dates
  function autoName(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const sLabel = s.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
    const eLabel = e.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
    return `${sLabel} — ${eLabel}`;
  }

  function handleStartChange(val: string) {
    setStartDate(val);
    if (!initial) setName(autoName(val, endDate));
  }

  function handleEndChange(val: string) {
    setEndDate(val);
    if (!initial) setName(autoName(startDate, val));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name: name.trim() || autoName(startDate, endDate), startDate, endDate, notes });
      }}
      className="space-y-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Nome</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={autoName(startDate, endDate)}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Início</label>
          <input
            type="date"
            value={startDate}
            min={initial ? undefined : today}
            onChange={(e) => handleStartChange(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Fim</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => handleEndChange(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notas opcionais..."
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 resize-none"
        />
      </div>

      <Button type="submit" disabled={isPending || !startDate || !endDate} className="w-full">
        {initial ? 'Guardar' : 'Criar Jornada'}
      </Button>
    </form>
  );
}

/* ───────────── Helpers ───────────── */

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day; // days until next Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday;
}
