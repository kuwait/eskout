// src/components/players/ObservationNotes.tsx
// Displays observation notes for a player and provides an inline form to add new ones
// Notes listed chronologically (newest first) with author, date, match context, priority
// RELEVANT FILES: src/actions/notes.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertTriangle, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { createObservationNote, deleteObservationNote } from '@/actions/notes';
import type { NotePriority, ObservationNote } from '@/lib/types';

interface ObservationNotesProps {
  playerId: number;
  notes: ObservationNote[];
  /** Controlled form visibility (optional — uses internal state if not provided) */
  showForm?: boolean;
  onShowFormChange?: (show: boolean) => void;
}

/* ───────────── Priority config ───────────── */

const PRIORITY_CONFIG: Record<NotePriority, {
  label: string;
  borderColor: string;
  bgColor: string;
  icon: typeof Flag | null;
  iconColor: string;
}> = {
  normal: {
    label: 'Normal',
    borderColor: 'border-l-neutral-300',
    bgColor: 'bg-neutral-50/60',
    icon: null,
    iconColor: '',
  },
  importante: {
    label: 'Importante',
    borderColor: 'border-l-yellow-400',
    bgColor: 'bg-yellow-50/60',
    icon: Flag,
    iconColor: 'text-yellow-600',
  },
  urgente: {
    label: 'Urgente',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50/60',
    icon: AlertTriangle,
    iconColor: 'text-red-600',
  },
};

const PRIORITY_OPTIONS: NotePriority[] = ['normal', 'importante', 'urgente'];

/* ───────────── Add button (rendered in Section header via action prop) ───────────── */

export function AddNoteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onClick}>
      <Plus className="h-3 w-3" />
      Nota
    </Button>
  );
}

/* ───────────── Main component ───────────── */

export function ObservationNotes({ playerId, notes, showForm: showFormProp, onShowFormChange }: ObservationNotesProps) {
  const router = useRouter();
  const [showFormInternal, setShowFormInternal] = useState(false);
  const showForm = showFormProp ?? showFormInternal;
  const setShowForm = onShowFormChange ?? setShowFormInternal;
  const [content, setContent] = useState('');
  const [matchContext, setMatchContext] = useState('');
  const [priority, setPriority] = useState<NotePriority>('normal');
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ObservationNote | null>(null);

  function handleSubmit() {
    if (!content.trim()) return;
    startTransition(async () => {
      const result = await createObservationNote(playerId, content, matchContext, priority);
      if (result.success) {
        setContent('');
        setMatchContext('');
        setPriority('normal');
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleCancel() {
    setShowForm(false);
    setContent('');
    setMatchContext('');
    setPriority('normal');
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteObservationNote(deleteTarget.id, playerId);
      if (result.success) {
        setDeleteTarget(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {/* Inline form */}
      {showForm && (
        <div className="space-y-2 rounded-md border bg-neutral-50/60 p-3">
          <Textarea
            placeholder="Escreva a sua observação..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="resize-none bg-white text-sm"
            autoFocus
          />
          <Input
            placeholder="Contexto — ex: Gondomar x Porto Sub-14"
            value={matchContext}
            onChange={(e) => setMatchContext(e.target.value)}
            className="bg-white text-sm"
          />
          {/* Priority selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Prioridade:</span>
            {PRIORITY_OPTIONS.map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              const isActive = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                    isActive
                      ? p === 'urgente' ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                      : p === 'importante' ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300'
                      : 'bg-neutral-200 text-neutral-700 ring-1 ring-neutral-300'
                    : 'bg-neutral-100 text-muted-foreground hover:bg-neutral-200'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={isPending || !content.trim()}>
              Guardar
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Sem notas de observação.</p>
      )}
      {notes.map((note) => {
        const cfg = PRIORITY_CONFIG[note.priority] ?? PRIORITY_CONFIG.normal;
        const PriorityIcon = cfg.icon;
        return (
          <div key={note.id} className={`group/note rounded-md border-l-[3px] px-3 py-2 ${cfg.borderColor} ${cfg.bgColor}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {PriorityIcon && <PriorityIcon className={`h-3 w-3 ${cfg.iconColor}`} />}
                <span className="text-xs font-medium">{note.authorName}</span>
                {note.priority !== 'normal' && (
                  <span className={`text-[10px] font-semibold uppercase ${cfg.iconColor}`}>
                    {cfg.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{fmtRelative(note.createdAt)}</span>
                <button
                  onClick={() => setDeleteTarget(note)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover/note:opacity-100"
                  title="Apagar nota"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {note.matchContext && (
              <p className="mt-0.5 text-xs font-medium text-blue-600">{note.matchContext}</p>
            )}
            <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{note.content}</p>
          </div>
        );
      })}

      {/* ───────────── Delete confirmation dialog ───────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar nota</DialogTitle>
            <DialogDescription>
              Tens a certeza que queres apagar esta nota de observação? Esta ação não pode ser revertida.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className={`rounded-md border-l-[3px] px-3 py-2 ${PRIORITY_CONFIG[deleteTarget.priority]?.borderColor ?? 'border-l-neutral-300'} ${PRIORITY_CONFIG[deleteTarget.priority]?.bgColor ?? 'bg-neutral-50'}`}>
              <p className="text-xs font-medium text-muted-foreground">{deleteTarget.authorName}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-snug">{deleteTarget.content}</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={isPending}>
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Helpers ───────────── */

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
