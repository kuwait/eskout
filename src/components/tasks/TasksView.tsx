// src/components/tasks/TasksView.tsx
// Client component for the personal tasks page — checkbox TODO list with create/toggle/delete
// Shows manual tasks + auto-generated tasks from pipeline + flagged observation notes section
// RELEVANT FILES: src/actions/tasks.ts, src/app/tarefas/page.tsx, src/lib/types/index.ts

'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Flag, ListTodo, Pencil, Phone, Plus, Search, Trash2, User, Users2, X } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { fuzzyMatch } from '@/lib/utils';
import { createTask, toggleTask, updateTask, deleteTask, getMyTasks } from '@/actions/tasks';
import { dismissFlaggedNote, updateObservationNote } from '@/actions/notes';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { UserTask, NotePriority } from '@/lib/types';
import type { FlaggedNote } from '@/lib/supabase/queries';

/* ───────────── Source labels for auto-tasks ───────────── */

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  pipeline_contact: 'Contacto',
  pipeline_meeting: 'Reunião',
  pipeline_training: 'Treino',
  pipeline_signing: 'Assinatura',
};

/** Source-specific styling for task type badges */
const SOURCE_STYLE: Record<string, { bg: string; text: string }> = {
  manual: { bg: 'bg-neutral-100', text: 'text-neutral-600' },
  pipeline_contact: { bg: 'bg-purple-50', text: 'text-purple-700' },
  pipeline_meeting: { bg: 'bg-blue-50', text: 'text-blue-700' },
  pipeline_training: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  pipeline_signing: { bg: 'bg-green-50', text: 'text-green-700' },
};

/* ───────────── Format due date ───────────── */

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = (target.getTime() - today.getTime()) / 86400000;

  // Check if the stored value includes a time component (not midnight)
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const timeSuffix = hasTime ? ` ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : '';

  if (diff === 0) return `Hoje${timeSuffix}`;
  if (diff === 1) return `Amanhã${timeSuffix}`;
  if (diff === -1) return `Ontem${timeSuffix}`;

  // For all other dates (past or future), show dd/MM format
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) + timeSuffix;
}

/** Get effective date for a task — due_date, or fallback to player's pipeline date */
function getEffectiveDate(task: UserTask): string | null {
  if (task.dueDate) return task.dueDate;
  if (task.source === 'pipeline_meeting') return task.playerMeetingDate;
  if (task.source === 'pipeline_signing') return task.playerSigningDate;
  return null;
}

function isDueDateOverdue(dateStr: string): boolean {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/* ───────────── Relative time format ───────────── */

function fmtRelative(v: string): string {
  try {
    const d = new Date(v);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin}min`;
    if (diffH < 24) return `há ${diffH}h`;
    if (diffD === 1) return 'há 1 dia';
    if (diffD < 7) return `há ${diffD} dias`;
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return v; }
}

/* ───────────── Priority styling ───────────── */

const PRIORITY_STYLE: Record<NotePriority, {
  label: string;
  border: string;
  bg: string;
  icon: typeof Flag;
  iconColor: string;
  photoBorder: string;
}> = {
  normal: { label: 'Normal', border: 'border-l-neutral-300', bg: 'bg-neutral-50/60', icon: Flag, iconColor: 'text-neutral-400', photoBorder: 'border-neutral-200/60' },
  importante: { label: 'Importante', border: 'border-l-yellow-400', bg: 'bg-yellow-50/60', icon: Flag, iconColor: 'text-yellow-600', photoBorder: 'border-yellow-300/30' },
  urgente: { label: 'Urgente', border: 'border-l-red-500', bg: 'bg-red-50/60', icon: AlertTriangle, iconColor: 'text-red-600', photoBorder: 'border-red-300/25' },
};

/* ───────────── Main Component ───────────── */

interface TasksViewProps {
  initialTasks: UserTask[];
  flaggedNotes?: FlaggedNote[];
  /** Current user role — admin gets user picker */
  userRole?: string;
  /** Club members for admin user picker */
  clubMembers?: { id: string; fullName: string }[];
  /** Players for task player picker */
  allPlayers?: { id: number; name: string; club: string; position: string; photoUrl?: string | null }[];
}

export function TasksView({ initialTasks, flaggedNotes = [], userRole = 'editor', clubMembers = [], allPlayers = [] }: TasksViewProps) {
  const [tasks, setTasks] = useState(initialTasks);

  // Lookup map: playerId → photoUrl (for task row avatars)
  const playerPhotoMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of allPlayers) {
      if (p.photoUrl) map.set(p.id, p.photoUrl);
    }
    return map;
  }, [allPlayers]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [, startTransition] = useTransition();

  // Admin: view tasks of another user
  const isAdmin = userRole === 'admin';
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');
  const targetName = targetUserId ? clubMembers.find((m) => m.id === targetUserId)?.fullName ?? null : null;

  // Realtime: refetch when other users modify tasks
  useRealtimeTable('user_tasks', {
    onAny: () => {
      getMyTasks(targetUserId ?? undefined).then(setTasks);
    },
  });

  // Split pending vs completed, then group pending by urgency
  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  // Group pending tasks by effective date: overdue → today → upcoming
  const overdueTasks = pending.filter((t) => { const d = getEffectiveDate(t); return d && isDueDateOverdue(d); });
  const todayTasks = pending.filter((t) => {
    const ed = getEffectiveDate(t);
    if (!ed) return false;
    const d = new Date(ed); d.setHours(0, 0, 0, 0);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return d.getTime() === now.getTime();
  });
  const upcomingTasks = pending.filter((t) => {
    const ed = getEffectiveDate(t);
    if (!ed) return true; // no date = upcoming
    const d = new Date(ed); d.setHours(0, 0, 0, 0);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return d > now;
  });
  // Tasks are grouped only if there's a mix; otherwise show flat list
  const hasGroups = overdueTasks.length > 0 && (todayTasks.length + upcomingTasks.length) > 0;

  /* ───────────── Handlers ───────────── */

  function handleCreate(title: string, opts: { dueDate?: string | null; playerId?: number | null }) {
    setCreateDialogOpen(false);

    startTransition(async () => {
      const result = await createTask(title, {
        dueDate: opts.dueDate ?? undefined,
        playerId: opts.playerId ?? undefined,
        targetUserId: targetUserId ?? undefined,
      });
      if (result.success) {
        const refreshed = await getMyTasks(targetUserId ?? undefined);
        setTasks(refreshed);
      }
    });
  }

  function handleToggle(taskId: number) {
    // Optimistic toggle
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed, completedAt: t.completed ? null : new Date().toISOString() } : t
      )
    );

    startTransition(async () => {
      await toggleTask(taskId);
      // Always refetch — server may have removed a duplicate auto-task
      const refreshed = await getMyTasks(targetUserId ?? undefined);
      setTasks(refreshed);
    });
  }

  function handleDelete(taskId: number) {
    // Optimistic remove
    setTasks((cur) => cur.filter((t) => t.id !== taskId));

    startTransition(async () => {
      const result = await deleteTask(taskId);
      if (!result.success) {
        const refreshed = await getMyTasks(targetUserId ?? undefined);
        setTasks(refreshed);
      }
    });
  }

  // Edit task state
  const [editingTask, setEditingTask] = useState<UserTask | null>(null);

  function handleEdit(taskId: number, updates: { title?: string; dueDate?: string | null; playerId?: number | null }) {
    // Optimistic update
    setTasks((cur) =>
      cur.map((t) => {
        if (t.id !== taskId) return t;
        const updated = { ...t };
        if (updates.title !== undefined) updated.title = updates.title;
        if (updates.dueDate !== undefined) updated.dueDate = updates.dueDate;
        if (updates.playerId !== undefined) {
          updated.playerId = updates.playerId;
          updated.playerName = updates.playerId ? allPlayers.find((p) => p.id === updates.playerId)?.name ?? null : null;
        }
        return updated;
      })
    );
    setEditingTask(null);

    startTransition(async () => {
      const result = await updateTask(taskId, updates);
      // Always refetch to get fresh player name/contact from server
      const refreshed = await getMyTasks(targetUserId ?? undefined);
      setTasks(refreshed);
      if (!result.success) {
        // Revert handled by refetch above
      }
    });
  }

  // Admin: switch to viewing another user's tasks
  function handleSwitchUser(userId: string | null) {
    setTargetUserId(userId);
    setTargetPickerOpen(false);
    setTargetSearch('');
    startTransition(async () => {
      const refreshed = await getMyTasks(userId ?? undefined);
      setTasks(refreshed);
    });
  }

  const filteredMembers = clubMembers.filter((m) => !targetSearch || m.fullName.toLowerCase().includes(targetSearch.toLowerCase()));

  return (
    <div>
      {/* ───── Header ───── */}
      <div className="mx-auto mb-6 flex max-w-5xl items-center gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Tarefas</h1>
        {pending.length > 0 && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            {pending.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && clubMembers.length > 0 && (
            <button
              type="button"
              onClick={() => setTargetPickerOpen(true)}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-accent/50"
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn('max-w-[120px] truncate', targetName ? 'font-medium' : 'text-muted-foreground')}>
                {targetName ?? 'Minhas'}
              </span>
              <ChevronsUpDown className="h-3 w-3 opacity-40" />
            </button>
          )}
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nova tarefa
          </Button>
        </div>
      </div>

      {/* Admin user picker dialog */}
      <CommandDialog open={targetPickerOpen} onOpenChange={(v) => { setTargetPickerOpen(v); if (!v) setTargetSearch(''); }} className="top-[10%] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" showCloseButton={false}>
        <CommandInput placeholder="Pesquisar utilizador..." value={targetSearch} onValueChange={setTargetSearch} onClear={() => setTargetSearch('')} />
        <CommandList>
          <CommandEmpty>Sem resultados</CommandEmpty>
          <CommandGroup>
            <CommandItem value="__minhas__" onSelect={() => handleSwitchUser(null)}>
              <User className="mr-2 h-4 w-4 text-neutral-400" />
              As minhas tarefas
              {!targetUserId && <Check className="ml-auto h-4 w-4 text-blue-500" />}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Utilizadores">
            {filteredMembers.map((m) => (
              <CommandItem key={m.id} value={m.fullName} onSelect={() => handleSwitchUser(m.id)}>
                <User className="mr-2 h-4 w-4 text-neutral-400" />
                {m.fullName}
                {m.id === targetUserId && <Check className="ml-auto h-4 w-4 text-blue-500" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* ───── Single-column centered layout ───── */}
      <div className="mx-auto max-w-2xl space-y-6">
          {/* Empty state */}
          {pending.length === 0 && completed.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center">
              <ListTodo className="h-10 w-10 text-muted-foreground/20" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Sem tarefas</p>
                <p className="mx-auto mt-0.5 max-w-sm text-xs text-muted-foreground/60">Lista pessoal de tarefas — cria as tuas ou recebe-as automaticamente quando há contactos, reuniões ou treinos.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Nova tarefa
              </Button>
            </div>
          )}

          {/* Overdue section */}
          {overdueTasks.length > 0 && (
            <TaskSection label="Atrasadas" count={overdueTasks.length} accent="red">
              {overdueTasks.map((task) => (
                <TaskRow key={task.id} task={task} playerPhotoUrl={task.playerId ? playerPhotoMap.get(task.playerId) : undefined} clubMembers={clubMembers} onToggle={handleToggle} onEdit={setEditingTask} onDelete={handleDelete} />
              ))}
            </TaskSection>
          )}

          {/* Today section */}
          {todayTasks.length > 0 && (
            <TaskSection label="Hoje" count={todayTasks.length} accent="amber">
              {todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} playerPhotoUrl={task.playerId ? playerPhotoMap.get(task.playerId) : undefined} clubMembers={clubMembers} onToggle={handleToggle} onEdit={setEditingTask} onDelete={handleDelete} />
              ))}
            </TaskSection>
          )}

          {/* Upcoming / no-date section */}
          {upcomingTasks.length > 0 && (
            <TaskSection label={hasGroups ? 'Próximas' : undefined} count={hasGroups ? upcomingTasks.length : undefined}>
              {upcomingTasks.map((task) => (
                <TaskRow key={task.id} task={task} playerPhotoUrl={task.playerId ? playerPhotoMap.get(task.playerId) : undefined} clubMembers={clubMembers} onToggle={handleToggle} onEdit={setEditingTask} onDelete={handleDelete} />
              ))}
            </TaskSection>
          )}

          {/* Completed tasks */}
          {completed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showCompleted && '-rotate-90')} />
                Concluídas ({completed.length})
              </button>
              {showCompleted && (
                <TaskSection>
                  {completed.map((task) => (
                    <TaskRow key={task.id} task={task} playerPhotoUrl={task.playerId ? playerPhotoMap.get(task.playerId) : undefined} clubMembers={clubMembers} onToggle={handleToggle} onEdit={setEditingTask} onDelete={handleDelete} />
                  ))}
                </TaskSection>
              )}
            </div>
          )}

          {/* Flagged notes — below completed tasks */}
          {/* Flagged notes */}
          {flaggedNotes.length > 0 && !targetUserId && (
            <FlaggedNotesSection notes={flaggedNotes} />
          )}
      </div>

      {/* Create task dialog */}
      <TaskFormDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        allPlayers={allPlayers}
        onSave={(title, opts) => handleCreate(title, opts)}
      />

      {/* Edit task dialog */}
      {editingTask && (
        <TaskFormDialog
          mode="edit"
          open
          onOpenChange={(open) => { if (!open) setEditingTask(null); }}
          allPlayers={allPlayers}
          task={editingTask}
          onSave={(title, opts) => handleEdit(editingTask.id, { title, ...opts })}
        />
      )}
    </div>
  );
}

/* ───────────── Player Picker Dialog (fuzzy search + pagination) ───────────── */

const PICKER_PAGE_SIZE = 50;
const PICKER_DEBOUNCE = 300;

function TaskPlayerPickerDialog({
  open,
  onOpenChange,
  players,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: { id: number; name: string; club: string; position: string; photoUrl?: string | null }[];
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

/* ───────────── Task Section (card wrapper with optional header) ───────────── */

function TaskSection({ label, count, accent, children }: {
  label?: string;
  count?: number;
  accent?: 'red' | 'amber';
  children: React.ReactNode;
}) {
  const accentMap = {
    red: { label: 'text-red-700', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
    amber: { label: 'text-amber-700', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  };
  const a = accent ? accentMap[accent] : null;

  return (
    <div>
      {label && (
        <div className="mb-2 flex items-center gap-2 px-1">
          {a && <span className={cn('h-2 w-2 rounded-full', a.dot)} />}
          <span className={cn('text-xs font-bold uppercase tracking-wider', a?.label ?? 'text-muted-foreground')}>{label}</span>
          {count !== undefined && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', a?.badge ?? 'bg-muted text-muted-foreground')}>
              {count}
            </span>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="divide-y divide-border/40">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Single Task Row ───────────── */

function TaskRow({
  task,
  playerPhotoUrl,
  clubMembers,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: UserTask;
  playerPhotoUrl?: string;
  clubMembers?: { id: string; fullName: string }[];
  onToggle: (id: number) => void;
  onEdit: (task: UserTask) => void;
  onDelete: (id: number) => void;
}) {
  const sourceLabel = SOURCE_LABELS[task.source];
  const sourceStyle = SOURCE_STYLE[task.source];
  const effectiveDate = getEffectiveDate(task);
  const overdue = !task.completed && effectiveDate && isDueDateOverdue(effectiveDate);
  const showContact = task.playerContact && ['pipeline_contact', 'pipeline_meeting', 'pipeline_training'].includes(task.source);
  const isMeeting = task.source === 'pipeline_meeting';
  const isSigning = task.source === 'pipeline_signing';

  // Resolve attendee names for meeting/signing tasks
  const attendeeNames = useMemo(() => {
    if (!clubMembers?.length) return [];
    const ids = isMeeting ? task.playerMeetingAttendees : isSigning ? task.playerSigningAttendees : [];
    if (!ids?.length) return [];
    return ids
      .map((id) => clubMembers.find((m) => m.id === id)?.fullName)
      .filter(Boolean) as string[];
  }, [isMeeting, isSigning, task.playerMeetingAttendees, task.playerSigningAttendees, clubMembers]);

  return (
    <div className={cn(
      'group relative flex items-start px-4 py-3.5 transition-colors hover:bg-muted/20',
      task.completed && 'opacity-45',
    )}>
      {/* Actions — absolute, appears on hover over the right edge */}
      <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-card opacity-100 shadow-sm sm:opacity-0 sm:shadow-none sm:transition-opacity sm:group-hover:opacity-100 sm:group-hover:shadow-sm">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-accent hover:text-blue-500"
          aria-label="Editar tarefa"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-accent hover:text-red-500"
          aria-label="Eliminar tarefa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Left side: checkbox + avatar + text (shrinks to make room for pills) */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Checkbox — 24px touch target */}
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          className={cn(
            'mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all',
            task.completed
              ? 'border-green-500 bg-green-500 text-white'
              : overdue
                ? 'border-red-300 hover:border-red-500 hover:bg-red-50'
                : 'border-neutral-300 hover:border-blue-400 hover:bg-blue-50'
          )}
          aria-label={task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}
        >
          {task.completed && <Check className="h-3.5 w-3.5" />}
        </button>

        {/* Player avatar */}
        {task.playerId ? (
          <Link href={`/jogadores/${task.playerId}`} className="mt-0.5 shrink-0" title={task.playerName ?? undefined}>
            {playerPhotoUrl ? (
              <Image
                src={playerPhotoUrl}
                alt={task.playerName ?? ''}
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted/40">
                <User className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
            )}
          </Link>
        ) : (
          <div className="mt-0.5 h-8 w-8 shrink-0" />
        )}

        {/* Title + player name — min-w-0 allows text to wrap within available space */}
        <div className="min-w-0">
          <p className={cn(
            'text-sm leading-snug',
            task.completed ? 'text-muted-foreground line-through' : 'font-medium text-foreground'
          )}>
            {task.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {task.playerName && task.playerId && (
              <Link
                href={`/jogadores/${task.playerId}`}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                {task.playerName}
              </Link>
            )}
            {task.playerClub && (
              <span className="text-xs text-muted-foreground/60">{task.playerClub}</span>
            )}
            {showContact && (
              <a
                href={`tel:${task.playerContact}`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Phone className="h-3 w-3" />
                {task.playerContact}
              </a>
            )}
            {sourceLabel && sourceStyle && task.source !== 'manual' && (
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold sm:hidden', sourceStyle.bg, sourceStyle.text)}>
                {sourceLabel}
              </span>
            )}
          </div>
          {/* Meeting/signing details: attendees */}
          {(isMeeting || isSigning) && !task.completed && attendeeNames.length > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground/70">
              <span className="inline-flex items-center gap-1">
                <Users2 className="h-3 w-3" />
                {attendeeNames.join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right side: pills — never shrinks, always at far right */}
      <div className="ml-2.5 flex shrink-0 items-center gap-1.5 pt-1">
        {effectiveDate && (
          <span className={cn(
            'whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
            overdue
              ? 'bg-red-100 font-bold text-red-700'
              : 'bg-muted/60 text-muted-foreground'
          )}>
            {formatDueDate(effectiveDate)}
          </span>
        )}

        {sourceLabel && sourceStyle && task.source !== 'manual' && (
          <span className={cn('hidden whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold sm:inline-flex', sourceStyle.bg, sourceStyle.text)}>
            {sourceLabel}
          </span>
        )}

        {task.completed && (
          <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold text-green-700">
            Concluída
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────── Unified Task Form Dialog (create + edit) ───────────── */

function TaskFormDialog({
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
  allPlayers: { id: number; name: string; club: string; position: string; photoUrl?: string | null }[];
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

/* ───────────── Flagged Notes Section (replaces /alertas page) ───────────── */

function FlaggedNotesSection({ notes: initialNotes }: { notes: FlaggedNote[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dismissTarget, setDismissTarget] = useState<FlaggedNote | null>(null);
  const [editTarget, setEditTarget] = useState<FlaggedNote | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [editedNotes, setEditedNotes] = useState<Map<number, Partial<FlaggedNote>>>(new Map());

  // Realtime: refresh when notes change
  useRealtimeTable('observation_notes', { onAny: () => router.refresh() });

  const notes = initialNotes
    .filter((n) => !dismissedIds.has(n.id))
    .map((n) => {
      const edits = editedNotes.get(n.id);
      return edits ? { ...n, ...edits } : n;
    })
    .filter((n) => n.priority === 'importante' || n.priority === 'urgente');

  if (notes.length === 0) return null;

  const urgentes = notes.filter((n) => n.priority === 'urgente');
  const importantes = notes.filter((n) => n.priority === 'importante');

  function confirmEdit(content: string, matchContext: string, priority: NotePriority) {
    if (!editTarget) return;
    const noteId = editTarget.id;
    const playerId = editTarget.playerId;

    setEditedNotes((prev) => new Map(prev).set(noteId, { content, matchContext: matchContext || null, priority }));
    setEditTarget(null);

    startTransition(async () => {
      const result = await updateObservationNote(noteId, playerId, content, matchContext, priority);
      if (!result.success) {
        setEditedNotes((prev) => { const next = new Map(prev); next.delete(noteId); return next; });
      } else {
        router.refresh();
      }
    });
  }

  function confirmDismiss() {
    if (!dismissTarget) return;
    const noteId = dismissTarget.id;
    const playerId = dismissTarget.playerId;
    startTransition(async () => {
      const result = await dismissFlaggedNote(noteId, playerId);
      if (result.success) {
        setDismissedIds((prev) => new Set(prev).add(noteId));
        setDismissTarget(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <h2 className="text-base font-bold">Notas Prioritárias</h2>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          {notes.length}
        </span>
      </div>

      <div className="space-y-2">
        {urgentes.map((note) => (
          <NoteCard key={note.id} note={note} onDismiss={setDismissTarget} onEdit={setEditTarget} onNavigate={() => router.push(`/jogadores/${note.playerId}`)} />
        ))}
        {importantes.map((note) => (
          <NoteCard key={note.id} note={note} onDismiss={setDismissTarget} onEdit={setEditTarget} onNavigate={() => router.push(`/jogadores/${note.playerId}`)} />
        ))}
      </div>

      {/* Dismiss confirmation dialog */}
      <Dialog open={!!dismissTarget} onOpenChange={(open) => !open && setDismissTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dispensar nota prioritária</DialogTitle>
            <DialogDescription>
              A nota será removida deste painel mas continuará visível no perfil do jogador (com prioridade normal).
            </DialogDescription>
          </DialogHeader>
          {dismissTarget && (
            <div className={`rounded-md border-l-[3px] px-3 py-2 ${PRIORITY_STYLE[dismissTarget.priority].border} ${PRIORITY_STYLE[dismissTarget.priority].bg}`}>
              <p className="text-xs font-medium text-muted-foreground">{dismissTarget.playerName} — {dismissTarget.authorName}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-snug">{dismissTarget.content}</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDismissTarget(null)}>
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={confirmDismiss} disabled={isPending}>
              Dispensar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit note dialog */}
      {editTarget && (
        <EditNoteDialog
          note={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={confirmEdit}
          isPending={isPending}
        />
      )}
    </div>
  );
}

/* ───────────── Note Card ───────────── */

function NoteCard({ note, onDismiss, onEdit, onNavigate }: {
  note: FlaggedNote;
  onDismiss: (note: FlaggedNote) => void;
  onEdit: (note: FlaggedNote) => void;
  onNavigate: () => void;
}) {
  const style = PRIORITY_STYLE[note.priority];
  const Icon = style.icon;

  return (
    <div className={`group/card rounded-lg border-l-[3px] px-3 py-2.5 ${style.border} ${style.bg}`}>
      <div className="flex items-center gap-2.5">
        <button onClick={onNavigate} className="shrink-0">
          {note.playerPhotoUrl ? (
            <Image
              src={note.playerPhotoUrl}
              alt={note.playerName}
              width={36}
              height={36}
              unoptimized
              className={`h-9 w-9 rounded-lg border object-cover ${style.photoBorder}`}
            />
          ) : (
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-neutral-50 ${style.photoBorder}`}>
              <User className="h-4 w-4 text-neutral-400" />
            </div>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <button onClick={onNavigate} className="truncate text-sm font-semibold hover:underline">
              {note.playerName}
            </button>
            <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${style.iconColor} ${style.bg}`}>
              <Icon className="h-2.5 w-2.5" />
              {style.label}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {note.authorName} · {fmtRelative(note.createdAt)}
            </span>
            <div className="flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover/card:opacity-100">
              <button
                onClick={() => onEdit(note)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 transition-all hover:bg-blue-50 hover:text-blue-500"
                title="Editar nota"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDismiss(note)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 transition-all hover:bg-neutral-100 hover:text-neutral-600"
                title="Dispensar nota"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 border-l-2 border-neutral-300/60 pl-2.5">
        {note.matchContext && (
          <p className="mb-0.5 text-[11px] font-medium text-blue-600">{note.matchContext}</p>
        )}
        <p className="whitespace-pre-wrap text-xs italic leading-snug text-neutral-700">{note.content}</p>
      </div>
    </div>
  );
}

/* ───────────── Edit Note Dialog ───────────── */

function EditNoteDialog({ note, onClose, onSave, isPending }: {
  note: FlaggedNote;
  onClose: () => void;
  onSave: (content: string, matchContext: string, priority: NotePriority) => void;
  isPending: boolean;
}) {
  const [content, setContent] = useState(note.content);
  const [matchContext, setMatchContext] = useState(note.matchContext || '');
  const [priority, setPriority] = useState<NotePriority>(note.priority);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar nota</DialogTitle>
          <DialogDescription>{note.playerName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Contexto (jogo/treino)</Label>
            <Input
              value={matchContext}
              onChange={(e) => setMatchContext(e.target.value)}
              placeholder="Ex: Boavista vs Porto, Sub-14"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nota</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as NotePriority)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="importante">Importante</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => onSave(content, matchContext, priority)} disabled={isPending || !content.trim()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
