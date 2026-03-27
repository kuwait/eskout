// src/app/observacoes/[id]/RoundDetailClient.tsx
// Round detail view — availability form (all roles) + availability matrix (admin/editor)
// Scouts declare when they're free; coordinators see who's available for each day
// RELEVANT FILES: src/actions/scout-availability.ts, src/lib/types/index.ts, src/app/observacoes/[id]/page.tsx

'use client';

import { useEffect, useState, useTransition, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Binoculars, Calendar, Check, ChevronRight, Clock, Crosshair, Globe, MapPin, Pencil, Plus, Search, Sun, Trash2, UserPlus, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { addAvailability, removeAvailability } from '@/actions/scout-availability';
import { addManualGame, deleteGame, updateGame, getFpfMatchesForImport, addFpfGame } from '@/actions/scouting-games';
import { assignScout, removeAssignment } from '@/actions/scout-assignments';
import { addGameTarget, removeGameTarget } from '@/actions/game-targets';
import { updateScoutingRound, updateRoundStatus, deleteScoutingRound } from '@/actions/scouting-rounds';
import { QuickReportForm } from '@/components/players/QuickReportForm';
import { searchPickerPlayers } from '@/actions/player-lists';
import type { AvailabilityPeriod, AvailabilityType, GameObservationTarget, PickerPlayer, ScoutAssignment, ScoutAvailability, ScoutingGame, ScoutingRound } from '@/lib/types';

/* ───────────── Constants ───────────── */

const AVAILABILITY_TYPE_OPTIONS: { value: AvailabilityType; label: string; icon: typeof Check }[] = [
  { value: 'always', label: 'Sempre disponível', icon: Check },
  { value: 'full_day', label: 'Dia inteiro', icon: Calendar },
  { value: 'period', label: 'Período', icon: Sun },
  { value: 'time_range', label: 'Hora exacta', icon: Clock },
];

const PERIOD_OPTIONS: { value: AvailabilityPeriod; label: string }[] = [
  { value: 'morning', label: 'Manhã' },
  { value: 'afternoon', label: 'Tarde' },
  { value: 'evening', label: 'Noite' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  published: { label: 'Publicada', color: 'bg-green-50 text-green-700 border-green-200' },
  closed: { label: 'Fechada', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/* ───────────── Component ───────────── */

export function RoundDetailClient({
  round,
  availability: initialAvailability,
  scouts,
  games: initialGames,
  assignments: initialAssignments,
  canManage,
  userId,
  initialTargets,
}: {
  round: ScoutingRound;
  availability: ScoutAvailability[];
  scouts: { id: string; name: string; role: string }[];
  games: ScoutingGame[];
  assignments: ScoutAssignment[];
  canManage: boolean;
  userId: string;
  initialTargets?: Record<number, GameObservationTarget[]>;
}) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [games, setGames] = useState(initialGames);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [targets, setTargets] = useState<Record<number, GameObservationTarget[]>>(initialTargets ?? {});
  const router = useRouter();
  const [editRoundOpen, setEditRoundOpen] = useState(false);
  const [deleteRoundConfirm, setDeleteRoundConfirm] = useState(false);
  const [roundDraft, setRoundDraft] = useState({ name: round.name, startDate: round.startDate, endDate: round.endDate, notes: round.notes });
  const [addOpen, setAddOpen] = useState(false);
  const [addGameOpen, setAddGameOpen] = useState(false);
  const [editGameTarget, setEditGameTarget] = useState<ScoutingGame | null>(null);
  const [assignDialogGameId, setAssignDialogGameId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const myAvailability = availability.filter((a) => a.scoutId === userId);
  const statusCfg = STATUS_CONFIG[round.status];

  // Days in the round range — use date string arithmetic to avoid timezone shifts
  const roundDays = useMemo(() => {
    const days: string[] = [];
    const [sy, sm, sd] = round.startDate.split('-').map(Number);
    const end = round.endDate;
    const current = new Date(sy, sm - 1, sd); // local date, no UTC shift
    while (true) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (dateStr > end) break;
      days.push(dateStr);
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [round.startDate, round.endDate]);

  function handleRemove(id: number) {
    startTransition(async () => {
      const res = await removeAvailability(id, round.id);
      if (res.success) {
        setAvailability((prev) => prev.filter((a) => a.id !== id));
        toast.success('Disponibilidade removida');
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Back + header */}
      <Link href="/observacoes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-neutral-700 transition">
        <ArrowLeft className="h-4 w-4" />
        Jornadas
      </Link>

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-neutral-900 sm:text-xl">
              {roundDraft.name || `${new Date(roundDraft.startDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })} — ${new Date(roundDraft.endDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}`}
            </h1>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', statusCfg.color)}>
              {statusCfg.label}
            </span>
          </div>
          {canManage && (
            <Button onClick={() => setEditRoundOpen(true)} size="sm" variant="outline" className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
          )}
        </div>
        {roundDraft.name && <p className="mt-1 text-sm text-muted-foreground">
          {new Date(roundDraft.startDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}
          {' — '}
          {new Date(roundDraft.endDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>}
        {roundDraft.notes && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
            <p className="text-xs text-amber-800">{roundDraft.notes}</p>
          </div>
        )}
      </div>

      {/* Scout/recruiter: show assigned games FIRST (before availability) */}
      {!canManage && games.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Os teus jogos ({games.length})</h2>
          <div className="space-y-2">
            {games.map((game) => (
              <ScoutGameCard key={game.id} game={game} gameTargets={targets[game.id] ?? []} />
            ))}
          </div>
        </section>
      )}

      {/* My availability section — hidden for admin/editor (they manage, not declare) */}
      {!canManage && <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">A tua disponibilidade</h2>
          <Button onClick={() => setAddOpen(true)} size="sm" variant="outline" className="gap-1.5" disabled={round.status === 'closed'}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>

        {myAvailability.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-neutral-200 py-6 text-center">
            <p className="text-sm text-muted-foreground">Sem disponibilidade declarada</p>
            {round.status !== 'closed' && (
              <p className="mt-1 text-xs text-muted-foreground/60">Adiciona quando estás disponível</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {myAvailability.map((a) => (
              <AvailabilitySlot key={a.id} slot={a} onRemove={() => handleRemove(a.id)} isPending={isPending} isClosed={round.status === 'closed'} />
            ))}
          </div>
        )}
      </section>}

      {/* Availability matrix — admin/editor only */}
      {canManage && scouts.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Disponibilidade da equipa</h2>
          <AvailabilityMatrix scouts={scouts} availability={availability} days={roundDays} />
        </section>
      )}

      {/* ───────────── Games Section (admin/editor only — scouts see theirs above) ───────────── */}
      {canManage && <section className="mb-8 mt-12 border-t border-neutral-200 pt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            Jogos ({games.length})
          </h2>
          {canManage && round.status !== 'closed' && (
            <div className="flex items-center gap-2">
              <Link href={`/observacoes/${round.id}/browse-fpf`}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Jogos FPF</span>
                  <span className="sm:hidden">FPF</span>
                </Button>
              </Link>
              <Button onClick={() => setAddGameOpen(true)} size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Adicionar Jogo</span>
                <span className="sm:hidden">Manual</span>
              </Button>
            </div>
          )}
        </div>

        {games.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-neutral-200 py-6 text-center">
            <p className="text-sm text-muted-foreground">{canManage ? 'Sem jogos adicionados' : 'Sem jogos atribuídos'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {games.map((game) => {
              const gameAssignments = assignments.filter((a) => a.gameId === game.id && a.status !== 'cancelled');
              return (
                <GameCard
                  key={game.id}
                  game={game}
                  assignments={gameAssignments}
                  scouts={scouts}
                  gameTargets={targets[game.id] ?? []}
                  canManage={canManage}
                  isClosed={round.status === 'closed'}
                  isPending={isPending}
                  roundId={round.id}
                  onEdit={() => setEditGameTarget(game)}
                  onDelete={() => {
                    startTransition(async () => {
                      const res = await deleteGame(game.id, round.id);
                      if (res.success) {
                        setGames((prev) => prev.filter((g) => g.id !== game.id));
                        setAssignments((prev) => prev.filter((a) => a.gameId !== game.id));
                        toast.success('Jogo eliminado');
                      } else {
                        toast.error(res.error);
                      }
                    });
                  }}
                  onAssign={() => setAssignDialogGameId(game.id)}
                  onRemoveAssignment={(assignmentId) => {
                    // Optimistic: remove from state immediately
                    const removed = assignments.find((a) => a.id === assignmentId);
                    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
                    startTransition(async () => {
                      const res = await removeAssignment(assignmentId, round.id);
                      if (res.success) {
                        toast.success('Atribuição removida');
                      } else {
                        // Rollback on failure
                        if (removed) setAssignments((prev) => [...prev, removed]);
                        toast.error(res.error);
                      }
                    });
                  }}
                  onTargetsChange={(newTargets) => setTargets((prev) => ({ ...prev, [game.id]: newTargets }))}
                />
              );
            })}
          </div>
        )}
      </section>}

      {/* Add game dialog */}
      <Dialog open={addGameOpen} onOpenChange={setAddGameOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Jogo</DialogTitle>
          </DialogHeader>
          <AddGameForm
            roundId={round.id}
            startDate={round.startDate}
            endDate={round.endDate}
            isPending={isPending}
            onManualSubmit={(data) => {
              startTransition(async () => {
                const res = await addManualGame(data);
                if (res.success && res.data) {
                  setGames((prev) => [...prev, res.data!].sort((a, b) => a.matchDate.localeCompare(b.matchDate)));
                  setAddGameOpen(false);
                  toast.success('Jogo adicionado');
                } else {
                  toast.error(res.error);
                }
              });
            }}
            onFpfImport={(fpfMatchId) => {
              startTransition(async () => {
                const res = await addFpfGame(round.id, fpfMatchId);
                if (res.success && res.data) {
                  setGames((prev) => [...prev, res.data!].sort((a, b) => a.matchDate.localeCompare(b.matchDate)));
                  toast.success('Jogo FPF importado');
                } else {
                  toast.error(res.error);
                }
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit game dialog */}
      <Dialog open={!!editGameTarget} onOpenChange={(open) => !open && setEditGameTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Jogo</DialogTitle>
          </DialogHeader>
          {editGameTarget && (
            <EditGameForm
              game={editGameTarget}
              isPending={isPending}
              onSubmit={(updates) => {
                startTransition(async () => {
                  const res = await updateGame(editGameTarget.id, round.id, updates);
                  if (res.success) {
                    setGames((prev) => prev.map((g) => g.id === editGameTarget.id ? { ...g, ...updates } : g));
                    setEditGameTarget(null);
                    toast.success('Jogo atualizado');
                  } else {
                    toast.error(res.error);
                  }
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Assign scout dialog */}
      <Dialog open={!!assignDialogGameId} onOpenChange={(open) => !open && setAssignDialogGameId(null)}>
        <DialogContent className="gap-0 p-0 sm:max-w-sm">
          <DialogHeader className="sr-only">
            <DialogTitle>Atribuir Scout</DialogTitle>
          </DialogHeader>
          {assignDialogGameId && (() => {
            const assignGame = games.find((g) => g.id === assignDialogGameId)!;
            const gameDate = new Date(assignGame.matchDate + 'T12:00:00');
            return (
              <>
                {/* Game context header */}
                <div className="border-b px-4 pb-3 pt-5">
                  <p className="text-sm font-semibold">{assignGame.homeTeam} vs {assignGame.awayTeam}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {gameDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })}
                    {assignGame.matchTime ? ` · ${assignGame.matchTime}` : ''}
                    {assignGame.venue ? ` · ${assignGame.venue}` : ''}
                  </p>
                </div>
                <div className="p-4">
                  <AssignScoutForm
                    game={assignGame}
              scouts={scouts}
              availability={availability}
              existingAssignments={assignments.filter((a) => a.gameId === assignDialogGameId && a.status !== 'cancelled')}
              isPending={isPending}
              onAssign={(scoutId) => {
                // Optimistic: close dialog + add placeholder assignment immediately
                const tempId = Date.now();
                const optimistic: ScoutAssignment = {
                  id: tempId,
                  clubId: '',
                  gameId: assignDialogGameId,
                  scoutId,
                  assignedBy: '',
                  status: 'assigned',
                  coordinatorNotes: '',
                  scoutNotes: '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                setAssignments((prev) => [...prev, optimistic]);
                setAssignDialogGameId(null);
                startTransition(async () => {
                  const res = await assignScout(assignDialogGameId, scoutId, round.id);
                  if (res.success && res.data) {
                    // Replace optimistic with real data (res.data is the assignment + conflicts)
                    const { conflicts: _, ...realAssignment } = res.data;
                    setAssignments((prev) => prev.map((a) => a.id === tempId ? realAssignment : a));
                    if (res.data.conflicts.length > 0) {
                      toast.warning(res.data.conflicts.map((c) => c.message).join('. '));
                    } else {
                      toast.success('Scout atribuído');
                    }
                  } else {
                    // Rollback optimistic
                    setAssignments((prev) => prev.filter((a) => a.id !== tempId));
                    toast.error(res.error);
                  }
                });
              }}
            />
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit round dialog */}
      {canManage && (
        <Dialog open={editRoundOpen} onOpenChange={setEditRoundOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Jornada</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await updateScoutingRound(round.id, roundDraft);
                if (res.success) {
                  setEditRoundOpen(false);
                  toast.success('Jornada atualizada');
                  router.refresh();
                } else {
                  toast.error(res.error ?? 'Erro');
                }
              });
            }} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Nome</label>
                <input value={roundDraft.name} onChange={(e) => setRoundDraft(d => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Início</label>
                  <input type="date" value={roundDraft.startDate} onChange={(e) => setRoundDraft(d => ({ ...d, startDate: e.target.value }))}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Fim</label>
                  <input type="date" value={roundDraft.endDate} onChange={(e) => setRoundDraft(d => ({ ...d, endDate: e.target.value }))}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Notas <span className="font-normal text-neutral-400">(visíveis para todos)</span></label>
                <textarea value={roundDraft.notes} onChange={(e) => setRoundDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Ex: Localização do torneio, instruções, etc."
                  rows={3}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 placeholder:text-neutral-400" />
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <div className="flex gap-2">
                  {round.status === 'published' && (
                    <button type="button" onClick={() => {
                      startTransition(async () => {
                        await updateRoundStatus(round.id, 'closed');
                        toast.success('Jornada fechada');
                        router.refresh();
                        setEditRoundOpen(false);
                      });
                    }} disabled={isPending} className="text-xs text-muted-foreground hover:text-foreground transition">
                      Fechar jornada
                    </button>
                  )}
                  {round.status === 'closed' && (
                    <button type="button" onClick={() => {
                      startTransition(async () => {
                        await updateRoundStatus(round.id, 'published');
                        toast.success('Jornada reaberta');
                        router.refresh();
                        setEditRoundOpen(false);
                      });
                    }} disabled={isPending} className="text-xs text-muted-foreground hover:text-foreground transition">
                      Reabrir jornada
                    </button>
                  )}
                  <button type="button" onClick={() => setDeleteRoundConfirm(true)} disabled={isPending} className="text-xs text-red-500 hover:text-red-700 transition">
                    Eliminar
                  </button>
                </div>
                <Button type="submit" disabled={isPending} size="sm">Guardar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete round confirmation */}
      <AlertDialog open={deleteRoundConfirm} onOpenChange={setDeleteRoundConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              A jornada &quot;{roundDraft.name || 'sem nome'}&quot; e todos os jogos, atribuições e pedidos de observação serão eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                startTransition(async () => {
                  const res = await deleteScoutingRound(round.id);
                  if (res.success) {
                    toast.success('Jornada eliminada');
                    router.push('/observacoes');
                  } else {
                    toast.error(res.error ?? 'Erro');
                  }
                });
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add availability dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Declarar disponibilidade</DialogTitle>
          </DialogHeader>
          <AvailabilityForm
            roundId={round.id}
            roundDays={roundDays}
            isPending={isPending}
            onSubmit={(data) => {
              startTransition(async () => {
                const res = await addAvailability(data);
                if (res.success && res.data) {
                  setAvailability((prev) => [...prev, res.data!]);
                  setAddOpen(false);
                  toast.success('Disponibilidade adicionada');
                } else {
                  toast.error(res.error);
                }
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Availability Slot Card ───────────── */

function AvailabilitySlot({ slot, onRemove, isPending, isClosed }: {
  slot: ScoutAvailability;
  onRemove: () => void;
  isPending: boolean;
  isClosed: boolean;
}) {
  const label = formatAvailabilityLabel(slot);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
        <Check className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        {slot.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{slot.notes}</p>}
      </div>
      {!isClosed && (
        <button type="button" onClick={onRemove} disabled={isPending} className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-500 transition">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ───────────── Availability Matrix ───────────── */

function AvailabilityMatrix({ scouts, availability, days }: {
  scouts: { id: string; name: string; role: string }[];
  availability: ScoutAvailability[];
  days: string[];
}) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  // Build lookup: scoutId → { date → slots[] }
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, ScoutAvailability[]>> = {};
    const alwaysScouts = new Set<string>();
    const scoutsWithAvailability = new Set<string>();

    for (const a of availability) {
      scoutsWithAvailability.add(a.scoutId);
      if (a.availabilityType === 'always') {
        alwaysScouts.add(a.scoutId);
        continue;
      }
      if (!a.availableDate) continue;
      if (!m[a.scoutId]) m[a.scoutId] = {};
      if (!m[a.scoutId][a.availableDate]) m[a.scoutId][a.availableDate] = [];
      m[a.scoutId][a.availableDate].push(a);
    }

    return { dated: m, alwaysScouts, scoutsWithAvailability };
  }, [availability]);

  // Filter scouts: show those with availability first (or all if toggled)
  const filteredScouts = useMemo(() => {
    let list = showAll ? scouts : scouts.filter((s) => matrix.scoutsWithAvailability.has(s.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [scouts, matrix.scoutsWithAvailability, showAll, search]);

  const availableCount = matrix.scoutsWithAvailability.size;
  const totalCount = scouts.length;

  return (
    <div>
      {/* Header with counters, search, and toggle */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {availableCount}/{totalCount} declararam disponibilidade
        </p>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs font-medium text-blue-600 hover:text-blue-500"
        >
          {showAll ? 'Só com disponibilidade' : 'Ver todos'}
        </button>
        <input
          type="text"
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto h-7 w-36 rounded border bg-background px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {filteredScouts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-neutral-200 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            {search ? 'Nenhum scout encontrado' : 'Ninguém declarou disponibilidade'}
          </p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-neutral-50">
                <th className="sticky left-0 top-0 z-20 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600">Scout</th>
                {days.map((day) => {
                  const d = new Date(day + 'T12:00:00');
                  const weekday = d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
                  const dayNum = d.getDate();
                  return (
                    <th key={day} className="sticky top-0 z-10 min-w-[60px] bg-neutral-50 px-2 py-2 text-center font-medium text-neutral-600">
                      <div className="text-[10px] uppercase text-muted-foreground">{weekday}</div>
                      <div>{dayNum}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredScouts.map((scout) => {
                const isAlways = matrix.alwaysScouts.has(scout.id);
                const hasAny = matrix.scoutsWithAvailability.has(scout.id);
                return (
                  <tr key={scout.id} className={cn('border-b last:border-0', !hasAny && 'opacity-40')}>
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-neutral-900 whitespace-nowrap">
                      {scout.name}
                      <span className="ml-1.5 text-[10px] text-muted-foreground/50">{scout.role === 'scout' ? '' : scout.role}</span>
                    </td>
                    {days.map((day) => {
                      const slots = matrix.dated[scout.id]?.[day] ?? [];
                      return (
                        <td key={day} className="px-2 py-2 text-center">
                          {isAlways ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : slots.length > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {slots.map((s) => (
                                <span key={s.id} className="rounded bg-green-50 px-1 py-0.5 text-[9px] font-medium text-green-700">
                                  {formatShortLabel(s)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────── Availability Form ───────────── */

function AvailabilityForm({ roundId, roundDays, isPending, onSubmit }: {
  roundId: number;
  roundDays: string[];
  isPending: boolean;
  onSubmit: (data: {
    roundId: number;
    availabilityType: string;
    availableDate?: string;
    period?: string;
    timeStart?: string;
    timeEnd?: string;
    notes?: string;
  }) => void;
}) {
  const [type, setType] = useState<AvailabilityType>('full_day');
  const [date, setDate] = useState(roundDays[0] ?? '');
  const [period, setPeriod] = useState<AvailabilityPeriod>('morning');
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
      className="space-y-4"
    >
      {/* Type selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-600">Tipo</label>
        <div className="grid grid-cols-2 gap-2">
          {AVAILABILITY_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition',
                  type === opt.value
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date — not shown for 'always' */}
      {type !== 'always' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Dia</label>
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            {roundDays.map((day) => {
              const d = new Date(day);
              const label = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
              return <option key={day} value={day}>{label}</option>;
            })}
          </select>
        </div>
      )}

      {/* Period selector */}
      {type === 'period' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Período</label>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  period === opt.value
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time range */}
      {type === 'time_range' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">De</label>
            <input
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Até</label>
            <input
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Notas</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Só se for perto do Porto"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        Confirmar
      </Button>
    </form>
  );
}

/* ───────────── Helpers ───────────── */

function formatAvailabilityLabel(slot: ScoutAvailability): string {
  if (slot.availabilityType === 'always') return 'Sempre disponível';
  const dateLabel = slot.availableDate
    ? new Date(slot.availableDate).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  if (slot.availabilityType === 'full_day') return `${dateLabel} — dia inteiro`;
  if (slot.availabilityType === 'period') {
    const periodLabel = PERIOD_OPTIONS.find((p) => p.value === slot.period)?.label ?? slot.period;
    return `${dateLabel} — ${periodLabel}`;
  }
  if (slot.availabilityType === 'time_range') {
    return `${dateLabel} — ${slot.timeStart} às ${slot.timeEnd}`;
  }
  return dateLabel;
}

function formatShortLabel(slot: ScoutAvailability): string {
  if (slot.availabilityType === 'full_day') return 'Dia';
  if (slot.availabilityType === 'period') {
    return PERIOD_OPTIONS.find((p) => p.value === slot.period)?.label ?? '?';
  }
  if (slot.availabilityType === 'time_range') {
    return `${slot.timeStart}–${slot.timeEnd}`;
  }
  return '✓';
}

/* ───────────── Game Card ───────────── */

function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [imgError, setImgError] = useState(false);

  return photoUrl && !imgError ? (
    <Image src={photoUrl} alt={name.split(' ')[0]} width={56} height={56} onError={() => setImgError(true)} className="h-14 w-14 rounded-full border-2 border-white object-cover shadow-md" unoptimized />
  ) : (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-lg font-bold text-neutral-400 shadow-md dark:bg-neutral-700">
      {name.charAt(0)}
    </div>
  );
}

/* ───────────── Scout Game Card (read-only, with Observar link) ───────────── */

function ScoutGameCard({ game, gameTargets }: { game: ScoutingGame; gameTargets: GameObservationTarget[] }) {
  const router = useRouter();
  const [sy, sm, sd] = game.matchDate.split('-').map(Number);
  const dateLabel = new Date(sy, sm - 1, sd).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' });

  // QSR dialog state — tracks which player to evaluate (target or searched)
  const [qsrPlayer, setQsrPlayer] = useState<{ id: number; name: string; isGk: boolean; photoUrl: string | null; club: string; position: string | null } | null>(null);
  const [qsrDirty, setQsrDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Track completed targets locally (updated after QSR submit, before server refresh)
  const [completedPlayerIds, setCompletedPlayerIds] = useState<Set<number>>(new Set());

  // "Observar outro" search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PickerPlayer[]>([]);
  const [searching, setSearching] = useState(false);

  // Match context for QSR pre-fill
  const matchContext = useMemo(() => ({
    competition: game.competitionName ?? undefined,
    opponent: `${game.homeTeam} vs ${game.awayTeam}`,
    matchDate: game.matchDate ?? undefined,
    gameId: game.id,
  }), [game]);

  // Search with debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      const t = setTimeout(() => setSearchResults([]), 0);
      return () => clearTimeout(t);
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      const results = await searchPickerPlayers({ search: searchQuery.trim() });
      // Dedup by ID (RPC can return same player twice via name+club cross-match)
      const seen = new Set<number>();
      const unique = results.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      setSearchResults(unique);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  function shortName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-neutral-900">
          {game.homeTeam} <span className="font-normal text-muted-foreground">vs</span> {game.awayTeam}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{dateLabel}{game.matchTime ? ` · ${game.matchTime}` : ''}</span>
          {game.venue && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{game.venue}</span>}
          {game.escalao && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">{game.escalao}</span>}
          {game.competitionName && <span className="text-muted-foreground/60">{game.competitionName}</span>}
        </div>
        {game.notes && (
          <p className="mt-1.5 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-800">{game.notes}</p>
        )}
      </div>

      {/* Target players + observe another */}
      <div className="border-t px-4 py-2 space-y-1.5">
        {gameTargets.length > 0 && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Relatórios pedidos</p>
        )}
        {gameTargets.map((target) => {
          const done = target.hasReport || completedPlayerIds.has(target.playerId);
          return (
            <div
              key={target.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2.5 py-2 transition',
                done
                  ? 'bg-green-50 dark:bg-green-950/20'
                  : 'bg-amber-50 dark:bg-amber-950/20',
              )}
            >
              {done ? (
                <Check className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Crosshair className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/jogadores/${target.playerId}`}
                  className={cn('text-xs font-medium underline-offset-2 hover:underline', done ? 'text-green-700 dark:text-green-400' : 'text-amber-800 dark:text-amber-300')}
                >
                  {shortName(target.playerName)}
                </Link>
                {target.playerPosition && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{target.playerPosition}</span>
                )}
                {target.playerClub && (
                  <span className="ml-1 text-[10px] text-muted-foreground/60">· {target.playerClub}</span>
                )}
              </div>
              {!done && (
                <button
                  type="button"
                  onClick={() => setQsrPlayer({ id: target.playerId, name: target.playerName, isGk: target.playerPosition === 'GR', photoUrl: target.playerPhotoUrl, club: target.playerClub, position: target.playerPosition })}
                  className="shrink-0 text-[10px] font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400"
                >
                  Avaliar →
                </button>
              )}
              {done && (
                <button
                  type="button"
                  onClick={() => router.push(`/jogadores/${target.playerId}`)}
                  className="shrink-0 text-[10px] text-green-600 hover:text-green-500 dark:text-green-400"
                >
                  Ver avaliação →
                </button>
              )}
            </div>
          );
        })}

        {/* Observe another player — inline search */}
        {searchOpen ? (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar jogador..."
                autoFocus
                className="h-7 w-full rounded border bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            {searching && <p className="text-[10px] text-muted-foreground">A pesquisar...</p>}
            {searchResults.length > 0 && (
              <div className="max-h-32 divide-y overflow-y-auto rounded border bg-background">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setQsrPlayer({ id: p.id, name: p.name, isGk: p.positionNormalized === 'GR', photoUrl: null, club: p.club ?? '', position: p.positionNormalized });
                      setSearchOpen(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-accent/50"
                  >
                    <span className="truncate text-xs font-medium">{p.name}</span>
                    {p.positionNormalized && <span className="shrink-0 text-[10px] text-muted-foreground">{p.positionNormalized}</span>}
                    {p.club && <span className="shrink-0 truncate text-[10px] text-muted-foreground/60">{p.club}</span>}
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-[10px] text-muted-foreground">Nenhum jogador encontrado</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
          >
            <Plus className="h-3 w-3" />
            Avaliar outro jogador
          </button>
        )}
      </div>

      {/* QSR Dialog — opens inline when clicking a target or searched player */}
      <Dialog
        open={!!qsrPlayer}
        onOpenChange={(open) => {
          if (!open && qsrDirty) { setShowDiscardConfirm(true); return; }
          if (!open) { setQsrPlayer(null); setQsrDirty(false); }
        }}
      >
        <DialogContent className="gap-0 max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg" onInteractOutside={(e) => { if (qsrDirty) e.preventDefault(); }}>
          <DialogHeader className="sr-only">
            <DialogTitle>Avaliar {qsrPlayer ? shortName(qsrPlayer.name) : ''}</DialogTitle>
          </DialogHeader>
          {qsrPlayer && (
            <>
            {/* Player card header — same style as training feedback */}
            <div className="flex flex-col items-center border-b bg-neutral-50 px-4 pb-4 pt-6 text-center dark:bg-neutral-900/50">
              <PlayerAvatar name={qsrPlayer.name} photoUrl={qsrPlayer.photoUrl} />
              <p className="mt-2 text-sm font-bold text-foreground">{shortName(qsrPlayer.name)}</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {qsrPlayer.club && <span>{qsrPlayer.club}</span>}
                {qsrPlayer.club && qsrPlayer.position && <span className="text-muted-foreground/40">·</span>}
                {qsrPlayer.position && <span className="font-medium">{qsrPlayer.position}</span>}
              </div>
              {/* Match context */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                <span className="rounded-full border bg-white px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-neutral-800">
                  {game.homeTeam} vs {game.awayTeam}
                </span>
                {game.matchDate && (
                  <span className="rounded-full border bg-white px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-neutral-800">
                    {new Date(game.matchDate + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                    {game.matchTime ? ` · ${game.matchTime}` : ''}
                  </span>
                )}
                {game.escalao && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                    {game.escalao}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4">
            <QuickReportForm
              playerId={qsrPlayer.id}
              playerName={qsrPlayer.name}
              isGoalkeeper={qsrPlayer.isGk}
              initialMatchContext={matchContext}
              onSuccess={() => {
                // Mark target as completed locally for instant UI update
                if (qsrPlayer) setCompletedPlayerIds(prev => new Set(prev).add(qsrPlayer.id));
                setQsrPlayer(null); setQsrDirty(false); router.refresh();
              }}
              onCancel={() => {
                if (qsrDirty) setShowDiscardConfirm(true);
                else { setQsrPlayer(null); setQsrDirty(false); }
              }}
              onDirtyChange={setQsrDirty}
            />
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <Dialog open onOpenChange={() => setShowDiscardConfirm(false)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Descartar avaliação?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">Tens dados preenchidos que serão perdidos.</p>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setShowDiscardConfirm(false)} className="flex-1 text-xs">
                Continuar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setShowDiscardConfirm(false); setQsrPlayer(null); setQsrDirty(false); }} className="flex-1 text-xs">
                Descartar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ───────────── Admin Game Card ───────────── */

function GameCard({ game, assignments, scouts, gameTargets, canManage, isClosed, isPending, roundId, onEdit, onDelete, onAssign, onRemoveAssignment, onTargetsChange }: {
  game: ScoutingGame;
  assignments: ScoutAssignment[];
  scouts: { id: string; name: string; role: string }[];
  gameTargets: GameObservationTarget[];
  canManage: boolean;
  isClosed: boolean;
  isPending: boolean;
  roundId: number;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onRemoveAssignment: (id: number) => void;
  onTargetsChange: (targets: GameObservationTarget[]) => void;
}) {
  const dateLabel = new Date(game.matchDate).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const scoutMap = Object.fromEntries(scouts.map((s) => [s.id, s.name]));

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Game header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">
            {game.homeTeam} <span className="font-normal text-muted-foreground">vs</span> {game.awayTeam}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{dateLabel}{game.matchTime ? ` · ${game.matchTime}` : ''}</span>
            {game.venue && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{game.venue}</span>}
            {game.escalao && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">{game.escalao}</span>}
            {game.competitionName && <span className="text-muted-foreground/60">{game.competitionName}</span>}
            {game.fpfMatchId && <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-medium text-blue-600">FPF</span>}
          </div>
          {game.notes && (
            <p className="mt-1.5 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-800">{game.notes}</p>
          )}
        </div>

        {canManage && !isClosed && (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onEdit} disabled={isPending} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-neutral-700 transition" title="Editar jogo">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onAssign} disabled={isPending} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-neutral-700 transition" title="Atribuir scout">
              <UserPlus className="h-4 w-4" />
            </button>
            <button type="button" onClick={onDelete} disabled={isPending} className="rounded p-1.5 text-muted-foreground hover:text-red-500 transition" title="Eliminar jogo">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Assigned scouts */}
      {assignments.length > 0 && (
        <div className="border-t bg-neutral-50/50 px-3 py-2 flex flex-wrap gap-1.5">
          {assignments.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white border px-2 py-0.5 text-[11px] font-medium text-neutral-700">
              <Users className="h-3 w-3 text-muted-foreground" />
              {scoutMap[a.scoutId] ?? 'Scout'}
              {canManage && !isClosed && (
                <button type="button" onClick={() => onRemoveAssignment(a.id)} disabled={isPending} className="ml-0.5 rounded-full hover:bg-red-100 hover:text-red-500 transition p-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Observation targets — only show section when there are targets */}
      {(gameTargets.length > 0 || (canManage && !isClosed)) && (
        <GameTargetsSection
          game={game}
          targets={gameTargets}
          canManage={canManage}
          isClosed={isClosed}
          roundId={roundId}
          onTargetsChange={onTargetsChange}
        />
      )}
    </div>
  );
}

/* ───────────── Game Observation Targets ───────────── */

function GameTargetsSection({ game, targets, canManage, isClosed, roundId, onTargetsChange }: {
  game: ScoutingGame;
  targets: GameObservationTarget[];
  canManage: boolean;
  isClosed: boolean;
  roundId: number;
  onTargetsChange: (targets: GameObservationTarget[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PickerPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Search players with debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      // Clear on next tick to avoid synchronous setState in effect
      const clear = setTimeout(() => setSearchResults([]), 0);
      return () => clearTimeout(clear);
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      const results = await searchPickerPlayers({ search: searchQuery.trim() });
      // Exclude already-targeted players
      const existingIds = new Set(targets.map((t) => t.playerId));
      setSearchResults(results.filter((p) => !existingIds.has(p.id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, targets]);

  function handleAdd(player: PickerPlayer) {
    startTransition(async () => {
      const res = await addGameTarget(game.id, player.id, roundId);
      if (res.success && res.data) {
        onTargetsChange([...targets, res.data]);
        toast.success(`${player.name} adicionado como alvo`);
        setSearchQuery('');
        setSearchResults([]);
      } else {
        toast.error(res.error ?? 'Erro ao adicionar');
      }
    });
  }

  function handleRemove(target: GameObservationTarget) {
    // Optimistic remove
    onTargetsChange(targets.filter((t) => t.id !== target.id));
    startTransition(async () => {
      const res = await removeGameTarget(target.id, roundId);
      if (!res.success) {
        // Rollback
        onTargetsChange([...targets, target]);
        toast.error(res.error ?? 'Erro ao remover');
      }
    });
  }

  // Build QSR URL params for a target player
  function qsrUrl(target: GameObservationTarget): string {
    const params = new URLSearchParams();
    params.set('qsr', '1');
    params.set('gameId', String(game.id));
    if (game.competitionName) params.set('competition', game.competitionName);
    params.set('opponent', `${game.homeTeam} vs ${game.awayTeam}`);
    if (game.matchDate) params.set('matchDate', game.matchDate);
    return `/jogadores/${target.playerId}?${params.toString()}`;
  }

  // Short name: first + last
  function shortName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  return (
    <div className="border-t px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {targets.map((target) => (
          <Link
            key={target.id}
            href={target.hasReport ? `/jogadores/${target.playerId}` : qsrUrl(target)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition',
              target.hasReport
                ? 'text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/20'
                : 'font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20',
            )}
          >
            {target.hasReport ? <Check className="h-3 w-3 shrink-0" /> : <Crosshair className="h-3 w-3 shrink-0 opacity-50" />}
            {shortName(target.playerName)}
            {target.playerPosition && <span className="text-[9px] opacity-50">{target.playerPosition}</span>}
            {canManage && !isClosed && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(target); }}
                className="rounded-full p-0.5 opacity-30 hover:opacity-100 hover:text-red-500 transition"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </Link>
        ))}

        {canManage && !isClosed && !addOpen && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/50 transition hover:text-muted-foreground"
          >
            <Plus className="h-3 w-3" />
            Pedir relatório
          </button>
        )}
      </div>

      {/* Inline search — appears below chips when open */}
      {addOpen && canManage && (
        <div className="mt-2 space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar jogador..."
              autoFocus
              className="h-7 w-full rounded border bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button onClick={() => { setAddOpen(false); setSearchQuery(''); setSearchResults([]); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          {searching && <p className="text-[10px] text-muted-foreground">A pesquisar...</p>}
          {searchResults.length > 0 && (
            <div className="max-h-32 divide-y overflow-y-auto rounded border bg-background">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAdd(p)}
                  disabled={isPending}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-accent/50 disabled:opacity-50"
                >
                  <span className="truncate text-xs font-medium">{p.name}</span>
                  {p.positionNormalized && <span className="shrink-0 text-[10px] text-muted-foreground">{p.positionNormalized}</span>}
                  {p.club && <span className="shrink-0 truncate text-[10px] text-muted-foreground/60">{p.club}</span>}
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-[10px] text-muted-foreground">Nenhum jogador encontrado</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Add Game Form ───────────── */

function AddGameForm({ roundId, startDate, endDate, isPending, onManualSubmit, onFpfImport }: {
  roundId: number;
  startDate: string;
  endDate: string;
  isPending: boolean;
  onManualSubmit: (data: { roundId: number; homeTeam: string; awayTeam: string; matchDate: string; matchTime?: string; venue?: string; competitionName?: string; escalao?: string; notes?: string }) => void;
  onFpfImport: (fpfMatchId: number) => void;
}) {
  const [tab, setTab] = useState<'manual' | 'fpf'>('manual');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchDate, setMatchDate] = useState(startDate);
  const [matchTime, setMatchTime] = useState('');
  const [venue, setVenue] = useState('');
  const [competitionName, setCompetitionName] = useState('');
  const [escalao, setEscalao] = useState('');
  const [notes, setNotes] = useState('');

  // FPF tab state
  const [fpfMatches, setFpfMatches] = useState<{ id: number; homeTeam: string; awayTeam: string; matchDate: string; matchTime: string | null; venue: string | null; competitionName: string | null; escalao: string | null }[]>([]);
  const [fpfLoading, setFpfLoading] = useState(false);
  const [fpfLoaded, setFpfLoaded] = useState(false);

  async function loadFpfMatches() {
    setFpfLoading(true);
    const matches = await getFpfMatchesForImport(roundId, startDate, endDate);
    setFpfMatches(matches);
    setFpfLoading(false);
    setFpfLoaded(true);
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex rounded-lg border p-0.5">
        <button type="button" onClick={() => setTab('manual')} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition', tab === 'manual' ? 'bg-neutral-900 text-white' : 'text-muted-foreground hover:text-neutral-700')}>
          Manual
        </button>
        <button type="button" onClick={() => { setTab('fpf'); if (!fpfLoaded) loadFpfMatches(); }} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition', tab === 'fpf' ? 'bg-neutral-900 text-white' : 'text-muted-foreground hover:text-neutral-700')}>
          FPF
        </button>
      </div>

      {tab === 'manual' && (
        <form onSubmit={(e) => { e.preventDefault(); onManualSubmit({ roundId, homeTeam, awayTeam, matchDate, matchTime: matchTime || undefined, venue: venue || undefined, competitionName: competitionName || undefined, escalao: escalao || undefined, notes: notes || undefined }); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Equipa Casa</label>
              <input type="text" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} required placeholder="Ex: Padroense" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Equipa Fora</label>
              <input type="text" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} required placeholder="Ex: Leixões" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Data</label>
              <input type="date" value={matchDate} min={startDate} max={endDate} onChange={(e) => setMatchDate(e.target.value)} required className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Hora</label>
              <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Local</label>
              <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Campo" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Escalão</label>
              <input type="text" value={escalao} onChange={(e) => setEscalao(e.target.value)} placeholder="Sub-15" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Competição</label>
            <input type="text" value={competitionName} onChange={(e) => setCompetitionName(e.target.value)} placeholder="Torneio X" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Nota / Objectivo</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex: Relatório jogador X, mapear equipa toda..." className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 resize-none" />
          </div>
          <Button type="submit" disabled={isPending || !homeTeam || !awayTeam} className="w-full">Adicionar</Button>
        </form>
      )}

      {tab === 'fpf' && (
        <div>
          {fpfLoading && <p className="py-4 text-center text-sm text-muted-foreground">A carregar jogos FPF...</p>}
          {fpfLoaded && fpfMatches.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem jogos FPF disponíveis neste período</p>
          )}
          {fpfMatches.length > 0 && (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {fpfMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onFpfImport(m.id)}
                  disabled={isPending}
                  className="w-full rounded-lg border px-3 py-2 text-left transition hover:bg-accent/50 disabled:opacity-50"
                >
                  <p className="text-sm font-medium">{m.homeTeam} vs {m.awayTeam}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(m.matchDate).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })}
                    {m.matchTime ? ` · ${m.matchTime}` : ''}
                    {m.escalao ? ` · ${m.escalao}` : ''}
                    {m.venue ? ` · ${m.venue}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Assign Scout Form ───────────── */

/* ───────────── Edit Game Form ───────────── */

function EditGameForm({ game, isPending, onSubmit }: {
  game: ScoutingGame;
  isPending: boolean;
  onSubmit: (updates: { homeTeam?: string; awayTeam?: string; matchDate?: string; matchTime?: string; venue?: string; competitionName?: string; escalao?: string; notes?: string }) => void;
}) {
  const [homeTeam, setHomeTeam] = useState(game.homeTeam);
  const [awayTeam, setAwayTeam] = useState(game.awayTeam);
  const [matchDate, setMatchDate] = useState(game.matchDate);
  const [matchTime, setMatchTime] = useState(game.matchTime ?? '');
  const [venue, setVenue] = useState(game.venue ?? '');
  const [competitionName, setCompetitionName] = useState(game.competitionName ?? '');
  const [escalao, setEscalao] = useState(game.escalao ?? '');
  const [notes, setNotes] = useState(game.notes ?? '');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ homeTeam, awayTeam, matchDate, matchTime: matchTime || undefined, venue: venue || undefined, competitionName: competitionName || undefined, escalao: escalao || undefined, notes }); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Equipa Casa</label>
          <input type="text" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} required className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Equipa Fora</label>
          <input type="text" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} required className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Data</label>
          <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} required className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Hora</label>
          <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Local</label>
          <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Escalão</label>
          <input type="text" value={escalao} onChange={(e) => setEscalao(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Competição</label>
        <input type="text" value={competitionName} onChange={(e) => setCompetitionName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Nota / Objectivo</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex: Relatório jogador X, mapear equipa toda..." className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 resize-none" />
      </div>
      <Button type="submit" disabled={isPending || !homeTeam || !awayTeam} className="w-full">Guardar</Button>
    </form>
  );
}

/* ───────────── Assign Scout Form ───────────── */

function AssignScoutForm({ game, scouts, availability, existingAssignments, isPending, onAssign }: {
  game: ScoutingGame;
  scouts: { id: string; name: string; role: string }[];
  availability: ScoutAvailability[];
  existingAssignments: ScoutAssignment[];
  isPending: boolean;
  onAssign: (scoutId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const assignedIds = new Set(existingAssignments.map((a) => a.scoutId));

  // Check each scout's availability for this game's date + time
  const gameHour = game.matchTime ? parseInt(game.matchTime.split(':')[0], 10) : null;

  const scoutsWithAvail = scouts
    .filter((s) => !assignedIds.has(s.id))
    .map((s) => {
      const scoutAvail = availability.filter((a) => a.scoutId === s.id);
      const hasAlways = scoutAvail.some((a) => a.availabilityType === 'always');
      const dateSlots = scoutAvail.filter((a) => a.availableDate === game.matchDate);

      // Check time overlap for each date slot
      const matchingSlots = dateSlots.filter((a) => {
        if (a.availabilityType === 'full_day') return true;
        if (a.availabilityType === 'period' && gameHour !== null) {
          // morning: before 13h, afternoon: 13h-19h, evening: 19h+
          if (a.period === 'morning') return gameHour < 13;
          if (a.period === 'afternoon') return gameHour >= 13 && gameHour < 19;
          if (a.period === 'evening') return gameHour >= 19;
        }
        if (a.availabilityType === 'time_range' && gameHour !== null && a.timeStart && a.timeEnd) {
          const startH = parseInt(a.timeStart.split(':')[0], 10);
          const endH = parseInt(a.timeEnd.split(':')[0], 10);
          return gameHour >= startH && gameHour < endH;
        }
        // If no game time, any date match counts
        if (gameHour === null) return true;
        return false;
      });

      const isAvailable = hasAlways || matchingSlots.length > 0;
      const hasDeclaredForDate = dateSlots.length > 0;

      // Build label
      let availLabel = '';
      if (hasAlways) {
        availLabel = 'Sempre disponível';
      } else if (isAvailable) {
        availLabel = matchingSlots.map((a) => formatShortLabel(a)).join(', ');
      } else if (hasDeclaredForDate) {
        // Has availability for this day but NOT for this time — show just the slots
        availLabel = dateSlots.map((a) => formatShortLabel(a)).join(', ');
      } else if (scoutAvail.length > 0) {
        // Has availability for other days — show those slots
        availLabel = scoutAvail.map((a) =>
          a.availabilityType === 'always' ? 'Sempre' : formatShortLabel(a),
        ).join(', ');
      }

      return { ...s, isAvailable, availLabel, hasDeclared: scoutAvail.length > 0, hasDeclaredForDate };
    })
    // Sort: available first, then undeclared, then unavailable
    .sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      if (a.hasDeclared && !b.hasDeclared) return -1;
      if (!a.hasDeclared && b.hasDeclared) return 1;
      return a.name.localeCompare(b.name);
    });

  const q = search.toLowerCase().trim();
  const filtered = q ? scoutsWithAvail.filter((s) => s.name.toLowerCase().includes(q)) : scoutsWithAvail;

  // All hooks MUST be before any conditional returns
  const [confirmScout, setConfirmScout] = useState<typeof scoutsWithAvail[0] | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  // Group: available, unavailable, undeclared
  const available = filtered.filter((s) => s.isAvailable);
  const unavailable = filtered.filter((s) => !s.isAvailable && (s.hasDeclared || s.hasDeclaredForDate));
  const undeclared = filtered.filter((s) => !s.isAvailable && !s.hasDeclared && !s.hasDeclaredForDate);
  const othersCount = unavailable.length + undeclared.length;

  function handleScoutClick(scout: typeof scoutsWithAvail[0]) {
    if (scout.isAvailable) {
      onAssign(scout.id);
    } else {
      setConfirmScout(scout);
    }
  }

  if (scoutsWithAvail.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Todos os scouts já estão atribuídos</p>;
  }

  // Confirm context
  const confirmSlots = confirmScout ? availability.filter((a) => a.scoutId === confirmScout.id) : [];

  return (
    <div className="space-y-3">
      {/* Confirmation view */}
      {confirmScout ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <span className="font-semibold">{confirmScout.name}</span>
              {confirmSlots.length > 0
                ? <> não está disponível para este horário.</>
                : <> ainda não confirmou a sua disponibilidade.</>
              }
            </p>
            {confirmSlots.length > 0 && (
              <div className="mt-2 border-t border-amber-200/60 pt-2 dark:border-amber-700/40">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Disponível em</p>
                <div className="flex flex-wrap gap-1">
                  {confirmSlots.map((s) => (
                    <span key={s.id} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm dark:bg-amber-900/40 dark:text-amber-200">
                      {s.availabilityType === 'always'
                        ? 'Sempre'
                        : `${new Date(s.availableDate + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' })} · ${formatShortLabel(s)}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmScout(null)} className="h-8 flex-1 text-xs">
              Voltar
            </Button>
            <Button size="sm" onClick={() => { onAssign(confirmScout.id); setConfirmScout(null); }} disabled={isPending} className="h-8 flex-1 text-xs">
              Atribuir na mesma
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          {scoutsWithAvail.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {/* Available section */}
          {available.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-green-600">
                Disponíveis ({available.length})
              </p>
              <div className="divide-y rounded-lg border border-green-200 dark:border-green-900">
                {available.map((scout) => (
                  <button
                    key={scout.id}
                    type="button"
                    onClick={() => handleScoutClick(scout)}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-green-50 disabled:opacity-50 dark:hover:bg-green-950/20"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{scout.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{scout.availLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {available.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-neutral-200 py-3 text-center dark:border-neutral-700">
              <p className="text-[11px] text-muted-foreground">Nenhum scout disponível para este horário</p>
            </div>
          )}

          {/* Others toggle */}
          {othersCount > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowOthers(!showOthers)}
                className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
              >
                <ChevronRight className={cn('h-3 w-3 transition-transform', showOthers && 'rotate-90')} />
                <span>{showOthers ? 'Esconder' : 'Mostrar'} outros {othersCount} scout{othersCount !== 1 ? 's' : ''}</span>
              </button>
              {showOthers && (
                <div className="mt-1 divide-y rounded-lg border">
                  {[...unavailable, ...undeclared].map((scout) => {
                    // Amber dot = has availability but not for this time; Grey = no declaration at all
                    const hasDecl = scout.hasDeclared || scout.hasDeclaredForDate;
                    return (
                      <button
                        key={scout.id}
                        type="button"
                        onClick={() => handleScoutClick(scout)}
                        disabled={isPending}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-accent/50 disabled:opacity-50"
                      >
                        <span className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          hasDecl ? 'bg-amber-400' : 'bg-neutral-300 dark:bg-neutral-600',
                        )} />
                        <span className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          hasDecl ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}>{scout.name}</span>
                        {hasDecl && (
                          <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                            {scout.availLabel || 'Noutro horário'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 && scoutsWithAvail.length > 0 && (
            <p className="py-2 text-center text-[11px] text-muted-foreground">Nenhum scout encontrado</p>
          )}
        </>
      )}
    </div>
  );
}
