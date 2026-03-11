// src/components/tasks/TaskRow.tsx
// Task section wrapper and individual task row display component
// Renders a single task with checkbox, avatar, pills, and hover actions
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/components/tasks/tasks-utils.ts, src/lib/types/index.ts

'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Pencil, Phone, Trash2, User, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SOURCE_LABELS, SOURCE_STYLE, formatDueDate, getEffectiveDate, isDueDateOverdue } from './tasks-utils';
import type { UserTask } from '@/lib/types';

/* ───────────── Task Section (card wrapper with optional header) ───────────── */

export function TaskSection({ label, count, accent, children }: {
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

export function TaskRow({
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
