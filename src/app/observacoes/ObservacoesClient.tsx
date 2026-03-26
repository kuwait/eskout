// src/app/observacoes/ObservacoesClient.tsx
// Client component for scouting round management — list, create, edit, delete, status changes
// Admin/editor see full CRUD; scouts see read-only list of published rounds
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/lib/types/index.ts, src/app/observacoes/page.tsx

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Binoculars, Calendar, ChevronRight, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
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
import type { ScoutingRound, ScoutingRoundStatus, UserRole } from '@/lib/types';

/* ───────────── Constants ───────────── */

const STATUS_CONFIG: Record<ScoutingRoundStatus, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  published: { label: 'Publicada', color: 'bg-green-50 text-green-700 border-green-200' },
  closed: { label: 'Fechada', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/* ───────────── Component ───────────── */

export function ObservacoesClient({ rounds: initialRounds, userRole }: { rounds: ScoutingRound[]; userRole: UserRole }) {
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
          {rounds.map((round) => (
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
          ))}
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
    <Link href={`/observacoes/${round.id}`} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition hover:bg-accent/30">
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

      {/* Actions */}
      {canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" onClick={(e) => e.preventDefault()} className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-neutral-700 transition" disabled={isPending}>
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
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </Link>
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
