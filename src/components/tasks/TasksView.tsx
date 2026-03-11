// src/components/tasks/TasksView.tsx
// Client component for the personal tasks page — checkbox TODO list with create/toggle/delete
// Shows manual tasks + auto-generated tasks from pipeline + flagged observation notes section
// RELEVANT FILES: src/actions/tasks.ts, src/app/tarefas/page.tsx, src/lib/types/index.ts

'use client';

import { useState, useMemo, useTransition } from 'react';
import { Check, ChevronDown, ChevronsUpDown, ListTodo, Plus, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { createTask, toggleTask, updateTask, deleteTask, getMyTasks } from '@/actions/tasks';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { Button } from '@/components/ui/button';
import { TaskSection, TaskRow } from './TaskRow';
import { TaskFormDialog } from './TaskFormDialog';
import type { TaskPlayer } from './TaskFormDialog';
import { FlaggedNotesSection } from './FlaggedNotesSection';
import { getEffectiveDate, isDueDateOverdue } from './tasks-utils';
import type { UserTask } from '@/lib/types';
import type { FlaggedNote } from '@/lib/supabase/queries';

/* ───────────── Main Component ───────────── */

interface TasksViewProps {
  initialTasks: UserTask[];
  flaggedNotes?: FlaggedNote[];
  /** Current user role — admin gets user picker */
  userRole?: string;
  /** Club members for admin user picker */
  clubMembers?: { id: string; fullName: string }[];
  /** Players for task player picker */
  allPlayers?: TaskPlayer[];
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
