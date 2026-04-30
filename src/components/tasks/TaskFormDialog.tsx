// src/components/tasks/TaskFormDialog.tsx
// Unified create/edit task dialog with player picker sub-dialog
// Handles title, due date+time, and player association for manual tasks
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/components/tasks/tasks-utils.ts, src/lib/types/index.ts

'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, User, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { searchPickerPlayers } from '@/actions/player-lists';
import { extractSearchWords, matchesPickerSearch } from '@/lib/utils/search';
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
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (playerId: number, playerName: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pool, setPool] = useState<TaskPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), PICKER_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset state when dialog closes
  /* eslint-disable react-hooks/set-state-in-effect -- reset form when dialog closes */
  useEffect(() => {
    if (!open) { setSearch(''); setDebouncedSearch(''); setPage(0); setPool([]); }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetch players with server-side text search — only when there's a search term
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pool when search cleared (no async, just clearing)
    if (!debouncedSearch) { setPool([]); return; }
    let cancelled = false;
    setLoading(true);
    searchPickerPlayers({ search: debouncedSearch }).then((results) => {
      if (cancelled) return;
      setPool(results.map((p) => ({
        id: p.id,
        name: p.name,
        club: p.club,
        position: p.positionNormalized ?? '',
      })));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, debouncedSearch]);

  // Client-side cross-field + accent-insensitive refinement on top of server results
  const searchWords = extractSearchWords(debouncedSearch);
  const filtered = searchWords.length > 1
    ? pool.filter((p) => matchesPickerSearch({ name: p.name, club: p.club }, searchWords))
    : pool;

  // Reset page when search changes
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on search change
  useEffect(() => { setPage(0); }, [debouncedSearch]);

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
            {loading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : (
              <>
                {filtered.length} jogador{filtered.length !== 1 ? 'es' : ''}
                {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
              </>
            )}
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
          {!loading && pageResults.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum jogador encontrado.
            </p>
          )}
          {pageResults.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player.id, player.name)}
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

export interface TaskAssignableMember {
  id: string;
  fullName: string;
  role: string;
}

export function TaskFormDialog({
  mode,
  open,
  onOpenChange,
  task,
  onSave,
  currentUserId,
  members = [],
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: UserTask;
  onSave: (title: string, opts: { dueDate?: string | null; playerId?: number | null; playerName?: string | null; assignedToUserId?: string }) => void;
  /** Current logged-in user's ID — needed to label "Eu" and detect reassignment */
  currentUserId?: string;
  /** Club members eligible to be assigned (scouts excluded by caller) */
  members?: TaskAssignableMember[];
}) {
  const isCreate = mode === 'create';

  const [title, setTitle] = useState(task?.title ?? '');
  const existingDate = task?.dueDate ? task.dueDate.slice(0, 10) : '';
  const existingTime = task?.dueDate?.includes('T') ? task.dueDate.slice(11, 16) : '';
  const [dueDate, setDueDate] = useState(existingDate);
  const [dueTime, setDueTime] = useState(existingTime);
  const [playerId, setPlayerId] = useState<number | null>(task?.playerId ?? null);
  const [playerName, setPlayerName] = useState<string | null>(task?.playerName ?? null);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  // Default assignee = current owner of the task (or current user if creating)
  const [assignedToUserId, setAssignedToUserId] = useState<string | undefined>(task?.userId ?? currentUserId);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  // Reset form when opening the create dialog
  /* eslint-disable react-hooks/set-state-in-effect -- resets form state when dialog opens/closes */
  useEffect(() => {
    if (open && isCreate) {
      setTitle(''); setDueDate(''); setDueTime(''); setPlayerId(null); setPlayerName(null);
      setAssignedToUserId(currentUserId);
    }
    if (open && !isCreate && task) {
      setTitle(task.title);
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
      setDueTime(task.dueDate?.includes('T') ? task.dueDate.slice(11, 16) : '');
      setPlayerId(task.playerId);
      setPlayerName(task.playerName ?? null);
      setAssignedToUserId(task.userId);
    }
  }, [open, isCreate, task, currentUserId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit() {
    if (!title.trim()) return;
    const combinedDate = dueDate
      ? (dueTime ? `${dueDate}T${dueTime}` : dueDate)
      : null;
    // Only forward assignedToUserId when the dialog actually has the picker enabled (members provided)
    // and the value differs from the original owner — saves a redundant DB read on the server side.
    const opts: { dueDate?: string | null; playerId?: number | null; playerName?: string | null; assignedToUserId?: string } = {
      dueDate: combinedDate,
      playerId,
      playerName,
    };
    if (members.length > 0 && assignedToUserId && assignedToUserId !== (task?.userId ?? currentUserId)) {
      opts.assignedToUserId = assignedToUserId;
    }
    onSave(title.trim(), opts);
  }

  const currentAssignee = members.find((m) => m.id === assignedToUserId);
  const assigneeLabel = !assignedToUserId
    ? 'Eu'
    : assignedToUserId === currentUserId
      ? 'Eu'
      : currentAssignee?.fullName ?? 'Outro';

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
                  <button type="button" onClick={() => { setPlayerId(null); setPlayerName(null); }} className="text-muted-foreground/50 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Assignee picker — only when caller provides club members */}
            {members.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Atribuído a</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAssigneePickerOpen(true)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent/50',
                      assignedToUserId && assignedToUserId !== currentUserId
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'text-muted-foreground'
                    )}
                  >
                    <User className="h-3.5 w-3.5" />
                    {assigneeLabel}
                  </button>
                </div>
              </div>
            )}
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
        onSelect={(id, name) => { setPlayerId(id); setPlayerName(name); setPlayerPickerOpen(false); }}
      />

      {/* Assignee picker sub-dialog */}
      <AssigneePickerDialog
        open={assigneePickerOpen}
        onOpenChange={setAssigneePickerOpen}
        members={members}
        currentUserId={currentUserId}
        selectedUserId={assignedToUserId}
        onSelect={(userId) => { setAssignedToUserId(userId); setAssigneePickerOpen(false); }}
      />
    </>
  );
}

/* ───────────── Assignee Picker Dialog ───────────── */

function AssigneePickerDialog({
  open,
  onOpenChange,
  members,
  currentUserId,
  selectedUserId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: TaskAssignableMember[];
  currentUserId?: string;
  selectedUserId?: string;
  onSelect: (userId: string) => void;
}) {
  // Reorder so the current user is always first ("Eu"), then others alphabetical
  const ordered = [...members].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return a.fullName.localeCompare(b.fullName, 'pt-PT');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Atribuir tarefa</DialogTitle>
          <DialogDescription className="sr-only">Escolher um utilizador para esta tarefa</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {ordered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum utilizador disponível.
            </p>
          )}
          {ordered.map((m) => {
            const isMe = m.id === currentUserId;
            const isSelected = m.id === selectedUserId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
                  isSelected ? 'border-amber-200 bg-amber-50' : ''
                )}
              >
                <span className="truncate font-medium">{isMe ? 'Eu' : m.fullName}</span>
                {!isMe && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{m.role}</span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
