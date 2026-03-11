// src/components/tasks/tasks-utils.ts
// Pure utility functions and constants for the tasks page
// Extracted from TasksView.tsx to reduce file size and enable reuse
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/components/tasks/TaskRow.tsx, src/lib/types/index.ts

import { AlertTriangle, Flag } from 'lucide-react';
import type { UserTask, NotePriority } from '@/lib/types';

/* ───────────── Source labels for auto-tasks ───────────── */

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  pipeline_contact: 'Contacto',
  pipeline_meeting: 'Reunião',
  pipeline_training: 'Treino',
  pipeline_signing: 'Assinatura',
};

/** Source-specific styling for task type badges */
export const SOURCE_STYLE: Record<string, { bg: string; text: string }> = {
  manual: { bg: 'bg-neutral-100', text: 'text-neutral-600' },
  pipeline_contact: { bg: 'bg-purple-50', text: 'text-purple-700' },
  pipeline_meeting: { bg: 'bg-blue-50', text: 'text-blue-700' },
  pipeline_training: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  pipeline_signing: { bg: 'bg-green-50', text: 'text-green-700' },
};

/* ───────────── Priority styling ───────────── */

export const PRIORITY_STYLE: Record<NotePriority, {
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

/* ───────────── Date utilities ───────────── */

export function formatDueDate(dateStr: string): string {
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
export function getEffectiveDate(task: UserTask): string | null {
  if (task.dueDate) return task.dueDate;
  if (task.source === 'pipeline_meeting') return task.playerMeetingDate;
  if (task.source === 'pipeline_signing') return task.playerSigningDate;
  return null;
}

export function isDueDateOverdue(dateStr: string): boolean {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/* ───────────── Relative time format ───────────── */

export function fmtRelative(v: string): string {
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
