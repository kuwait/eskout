// src/app/observacoes/[id]/RoundDetailClient.tsx
// Round detail view — availability form (all roles) + availability matrix (admin/editor)
// Scouts declare when they're free; coordinators see who's available for each day
// RELEVANT FILES: src/actions/scout-availability.ts, src/lib/types/index.ts, src/app/observacoes/[id]/page.tsx

'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Binoculars, Calendar, Check, Clock, MapPin, Pencil, Plus, Sun, Trash2, UserPlus, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { addAvailability, removeAvailability } from '@/actions/scout-availability';
import { addManualGame, deleteGame, updateGame, getFpfMatchesForImport, addFpfGame } from '@/actions/scouting-games';
import { assignScout, removeAssignment } from '@/actions/scout-assignments';
import type { AvailabilityPeriod, AvailabilityType, ScoutAssignment, ScoutAvailability, ScoutingGame, ScoutingRound } from '@/lib/types';

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
}: {
  round: ScoutingRound;
  availability: ScoutAvailability[];
  scouts: { id: string; name: string; role: string }[];
  games: ScoutingGame[];
  assignments: ScoutAssignment[];
  canManage: boolean;
  userId: string;
}) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [games, setGames] = useState(initialGames);
  const [assignments, setAssignments] = useState(initialAssignments);
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
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-neutral-900 sm:text-xl">{round.name}</h1>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', statusCfg.color)}>
            {statusCfg.label}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(round.startDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}
          {' — '}
          {new Date(round.endDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        {round.notes && <p className="mt-1 text-xs text-muted-foreground/70">{round.notes}</p>}
      </div>

      {/* Scout/recruiter: show assigned games FIRST (before availability) */}
      {!canManage && games.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Os teus jogos ({games.length})</h2>
          <div className="space-y-2">
            {games.map((game) => (
              <ScoutGameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}

      {/* My availability section */}
      <section className="mb-8">
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
      </section>

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
            <Button onClick={() => setAddGameOpen(true)} size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Adicionar Jogo
            </Button>
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
                  canManage={canManage}
                  isClosed={round.status === 'closed'}
                  isPending={isPending}
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
                    startTransition(async () => {
                      const res = await removeAssignment(assignmentId, round.id);
                      if (res.success) {
                        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
                        toast.success('Atribuição removida');
                      } else {
                        toast.error(res.error);
                      }
                    });
                  }}
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Atribuir Scout</DialogTitle>
          </DialogHeader>
          {assignDialogGameId && (
            <AssignScoutForm
              game={games.find((g) => g.id === assignDialogGameId)!}
              scouts={scouts}
              availability={availability}
              existingAssignments={assignments.filter((a) => a.gameId === assignDialogGameId && a.status !== 'cancelled')}
              isPending={isPending}
              onAssign={(scoutId) => {
                startTransition(async () => {
                  const res = await assignScout(assignDialogGameId, scoutId, round.id);
                  if (res.success && res.data) {
                    setAssignments((prev) => [...prev, res.data!]);
                    if (res.data.conflicts.length > 0) {
                      toast.warning(res.data.conflicts.map((c) => c.message).join('. '));
                    } else {
                      toast.success('Scout atribuído');
                    }
                  } else {
                    toast.error(res.error);
                  }
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
  // Build lookup: scoutId → { date → slots[] }
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, ScoutAvailability[]>> = {};
    // Track "always" scouts
    const alwaysScouts = new Set<string>();

    for (const a of availability) {
      if (a.availabilityType === 'always') {
        alwaysScouts.add(a.scoutId);
        continue;
      }
      if (!a.availableDate) continue;
      if (!m[a.scoutId]) m[a.scoutId] = {};
      if (!m[a.scoutId][a.availableDate]) m[a.scoutId][a.availableDate] = [];
      m[a.scoutId][a.availableDate].push(a);
    }

    return { dated: m, alwaysScouts };
  }, [availability]);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-neutral-50">
            <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600">Scout</th>
            {days.map((day) => {
              const d = new Date(day);
              const weekday = d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
              const dayNum = d.getDate();
              return (
                <th key={day} className="min-w-[60px] px-2 py-2 text-center font-medium text-neutral-600">
                  <div className="text-[10px] uppercase text-muted-foreground">{weekday}</div>
                  <div>{dayNum}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {scouts.map((scout) => {
            const isAlways = matrix.alwaysScouts.has(scout.id);
            return (
              <tr key={scout.id} className="border-b last:border-0">
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

/* ───────────── Scout Game Card (read-only, with Observar link) ───────────── */

function ScoutGameCard({ game }: { game: ScoutingGame }) {
  const [sy, sm, sd] = game.matchDate.split('-').map(Number);
  const dateLabel = new Date(sy, sm - 1, sd).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' });

  // QSR pre-fill params
  const qsrParams = new URLSearchParams();
  qsrParams.set('qsr', '1');
  if (game.competitionName) qsrParams.set('competition', game.competitionName);
  qsrParams.set('opponent', `${game.homeTeam} vs ${game.awayTeam}`);
  if (game.matchDate) qsrParams.set('matchDate', game.matchDate);

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
      <div className="border-t bg-neutral-50/50 px-4 py-2 flex justify-end">
        <Link
          href={`/?${qsrParams.toString()}`}
          className="flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 transition"
        >
          <Binoculars className="h-3 w-3" />
          Observar
        </Link>
      </div>
    </div>
  );
}

/* ───────────── Admin Game Card ───────────── */

function GameCard({ game, assignments, scouts, canManage, isClosed, isPending, onEdit, onDelete, onAssign, onRemoveAssignment }: {
  game: ScoutingGame;
  assignments: ScoutAssignment[];
  scouts: { id: string; name: string; role: string }[];
  canManage: boolean;
  isClosed: boolean;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onRemoveAssignment: (id: number) => void;
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
        // Has availability for this day but NOT for this time
        availLabel = `Disponível: ${dateSlots.map((a) => formatShortLabel(a)).join(', ')} — jogo às ${game.matchTime ?? '?'}`;
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

  if (scoutsWithAvail.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Todos os scouts já estão atribuídos a este jogo</p>;
  }

  return (
    <div className="space-y-3">
      {/* Search — show if 5+ scouts */}
      {scoutsWithAvail.length >= 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar scout..."
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      )}

      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {filtered.map((scout) => (
          <button
            key={scout.id}
            type="button"
            onClick={() => onAssign(scout.id)}
            disabled={isPending}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50',
              scout.isAvailable
                ? 'border-green-200 bg-green-50/50 hover:bg-green-50'
                : 'hover:bg-accent/50'
            )}
          >
            {/* Availability indicator */}
            <div className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              scout.isAvailable ? 'bg-green-100 text-green-600' : (scout.hasDeclaredForDate || scout.hasDeclared) ? 'bg-red-100 text-red-500' : 'bg-neutral-100 text-neutral-400'
            )}>
              {scout.isAvailable ? <Check className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{scout.name}</p>
              <p className={cn('text-[11px]', scout.isAvailable ? 'text-green-600' : (scout.hasDeclaredForDate || scout.hasDeclared) ? 'text-red-500' : 'text-muted-foreground')}>
                {scout.isAvailable
                  ? scout.availLabel
                  : scout.hasDeclaredForDate
                    ? scout.availLabel
                    : scout.hasDeclared
                      ? 'Sem disponibilidade para este dia'
                      : 'Não declarou disponibilidade'}
              </p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-3 text-center text-sm text-muted-foreground">Nenhum scout encontrado</p>
        )}
      </div>
    </div>
  );
}
