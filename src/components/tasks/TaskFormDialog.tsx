// src/components/tasks/TaskFormDialog.tsx
// Unified create/edit task dialog with player picker sub-dialog
// Handles title, due date+time, and player association for manual tasks
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/components/tasks/tasks-utils.ts, src/lib/types/index.ts

'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, User, X } from 'lucide-react';
import { fuzzyMatch } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { UserTask } from '@/lib/types';

/* ───────────── Player Picker Dialog (fuzzy search + pagination) ───────────── */

const PICKER_PAGE_SIZE = 50;
const PICKER_DEBOUNCE = 300;

export type TaskPlayer = { id: number; name: string; club: string; position: string; photoUrl?: string | null };

function TaskPlayerPickerDialog({
  open,
  onOpenChange,
  players,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: TaskPlayer[];
  onSelect: (playerId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), PICKER_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when search changes
  /* eslint-disable react-hooks/set-state-in-effect -- resets pagination when search changes */
  useEffect(() => { setPage(0); }, [debouncedSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset state when dialog closes
  /* eslint-disable react-hooks/set-state-in-effect -- resets form state when dialog closes */
  useEffect(() => {
    if (!open) { setSearch(''); setDebouncedSearch(''); setPage(0); }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fuzzy filter on name, club, and position
  const filtered = useMemo(() => {
    if (!debouncedSearch) return players;
    return players.filter((p) =>
      fuzzyMatch(`${p.name} ${p.club} ${p.position}`, debouncedSearch)
    );
  }, [players, debouncedSearch]);

  const totalPages = Math.ceil(filtered.length / PICKER_PAGE_SIZE);
  const pageResults = filtered.slice(page * PICKER_PAGE_SIZE, (page + 1) * PICKER_PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Associar jogador</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar nome, clube ou posição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-transparent bg-muted/50 pl-10 pr-9 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/20"
            autoFocus
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label="Limpar pesquisa">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Results count + pagination */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {filtered.length} jogador{filtered.length !== 1 ? 'es' : ''}
            {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Player list */}
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {pageResults.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum jogador encontrado.
            </p>
          )}
          {pageResults.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player.id)}
              className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{player.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {player.club}
                  {player.position ? ` · ${player.position}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Unified Task Form Dialog (create + edit) ───────────── */

export function TaskFormDialog({
  mode,
  open,
  onOpenChange,
  allPlayers,
  task,
  onSave,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allPlayers: TaskPlayer[];
  task?: UserTask;
  onSave: (title: string, opts: { dueDate?: string | null; playerId?: number | null }) => void;
}) {
  const isCreate = mode === 'create';

  const [title, setTitle] = useState(task?.title ?? '');
  const existingDate = task?.dueDate ? task.dueDate.slice(0, 10) : '';
  const existingTime = task?.dueDate?.includes('T') ? task.dueDate.slice(11, 16) : '';
  const [dueDate, setDueDate] = useState(existingDate);
  const [dueTime, setDueTime] = useState(existingTime);
  const [playerId, setPlayerId] = useState<number | null>(task?.playerId ?? null);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);

  const playerName = playerId ? allPlayers.find((p) => p.id === playerId)?.name ?? task?.playerName : null;

  // Reset form when opening the create dialog
  /* eslint-disable react-hooks/set-state-in-effect -- resets form state when dialog opens/closes */
  useEffect(() => {
    if (open && isCreate) {
      setTitle(''); setDueDate(''); setDueTime(''); setPlayerId(null);
    }
    if (open && !isCreate && task) {
      setTitle(task.title);
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
      setDueTime(task.dueDate?.includes('T') ? task.dueDate.slice(11, 16) : '');
      setPlayerId(task.playerId);
    }
  }, [open, isCreate, task]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit() {
    if (!title.trim()) return;
    const combinedDate = dueDate
      ? (dueTime ? `${dueDate}T${dueTime}` : dueDate)
      : null;
    onSave(title.trim(), { dueDate: combinedDate, playerId });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isCreate ? 'Nova tarefa' : 'Editar tarefa'}</DialogTitle>
            <DialogDescription className="sr-only">
              {isCreate ? 'Criar uma nova tarefa' : 'Editar os detalhes da tarefa'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="O que precisas de fazer?"
                autoFocus
              />
            </div>

            {/* Due date + time */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data e hora</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 w-40 text-xs"
                />
                {dueDate && (
                  <Input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="h-9 w-28 text-xs"
                  />
                )}
                {dueDate && (
                  <button type="button" onClick={() => { setDueDate(''); setDueTime(''); }} className="text-muted-foreground/50 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Player picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Jogador</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlayerPickerOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent/50',
                    playerName ? 'border-blue-200 bg-blue-50 text-blue-700' : 'text-muted-foreground'
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                  {playerName ?? 'Nenhum'}
                </button>
                {playerId && (
                  <button type="button" onClick={() => setPlayerId(null)} className="text-muted-foreground/50 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>
              {isCreate ? 'Criar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Player picker sub-dialog */}
      <TaskPlayerPickerDialog
        open={playerPickerOpen}
        onOpenChange={setPlayerPickerOpen}
        players={allPlayers}
        onSelect={(id) => { setPlayerId(id); setPlayerPickerOpen(false); }}
      />
    </>
  );
}
