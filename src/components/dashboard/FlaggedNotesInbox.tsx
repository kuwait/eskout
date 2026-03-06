// src/components/dashboard/FlaggedNotesInbox.tsx
// Displays important and urgent observation notes across all players as an inbox
// Allows quick navigation to player profiles and dismissing (deleting) notes
// RELEVANT FILES: src/lib/supabase/queries.ts, src/actions/notes.ts, src/components/players/ObservationNotes.tsx

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertTriangle, Flag, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { deleteObservationNote } from '@/actions/notes';
import type { FlaggedNote } from '@/lib/supabase/queries';
import type { NotePriority } from '@/lib/types';

interface FlaggedNotesInboxProps {
  notes: FlaggedNote[];
}

/* ───────────── Priority styling ───────────── */

const PRIORITY_STYLE: Record<NotePriority, {
  label: string;
  border: string;
  bg: string;
  icon: typeof Flag;
  iconColor: string;
}> = {
  normal: { label: 'Normal', border: 'border-l-neutral-300', bg: 'bg-neutral-50/60', icon: Flag, iconColor: 'text-neutral-400' },
  importante: { label: 'Importante', border: 'border-l-yellow-400', bg: 'bg-yellow-50/60', icon: Flag, iconColor: 'text-yellow-600' },
  urgente: { label: 'Urgente', border: 'border-l-red-500', bg: 'bg-red-50/60', icon: AlertTriangle, iconColor: 'text-red-600' },
};

/* ───────────── Component ───────────── */

export function FlaggedNotesInbox({ notes: initialNotes }: FlaggedNotesInboxProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<FlaggedNote | null>(null);
  // Local state to allow optimistic removal after delete
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const notes = initialNotes.filter((n) => !dismissedIds.has(n.id));

  // Split by priority — urgente first
  const urgentes = notes.filter((n) => n.priority === 'urgente');
  const importantes = notes.filter((n) => n.priority === 'importante');

  if (notes.length === 0) return null;

  function confirmDelete() {
    if (!deleteTarget) return;
    const noteId = deleteTarget.id;
    const playerId = deleteTarget.playerId;
    startTransition(async () => {
      const result = await deleteObservationNote(noteId, playerId);
      if (result.success) {
        setDismissedIds((prev) => new Set(prev).add(noteId));
        setDeleteTarget(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <h2 className="text-base font-bold">Notas Prioritárias</h2>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          {notes.length}
        </span>
      </div>

      {/* Urgent notes */}
      {urgentes.length > 0 && (
        <div className="space-y-2">
          {urgentes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={setDeleteTarget} onNavigate={() => router.push(`/jogadores/${note.playerId}`)} />
          ))}
        </div>
      )}

      {/* Important notes */}
      {importantes.length > 0 && (
        <div className="space-y-2">
          {importantes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={setDeleteTarget} onNavigate={() => router.push(`/jogadores/${note.playerId}`)} />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar nota</DialogTitle>
            <DialogDescription>
              Tens a certeza que queres apagar esta nota? Esta ação não pode ser revertida.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className={`rounded-md border-l-[3px] px-3 py-2 ${PRIORITY_STYLE[deleteTarget.priority].border} ${PRIORITY_STYLE[deleteTarget.priority].bg}`}>
              <p className="text-xs font-medium text-muted-foreground">{deleteTarget.playerName} — {deleteTarget.authorName}</p>
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

/* ───────────── Note Card ───────────── */

function NoteCard({ note, onDelete, onNavigate }: {
  note: FlaggedNote;
  onDelete: (note: FlaggedNote) => void;
  onNavigate: () => void;
}) {
  const style = PRIORITY_STYLE[note.priority];
  const Icon = style.icon;

  return (
    <div className={`group/card rounded-lg border-l-[3px] px-3 py-2.5 ${style.border} ${style.bg}`}>
      <div className="flex gap-3">
        {/* Player photo */}
        <button onClick={onNavigate} className="shrink-0 self-start">
          {note.playerPhotoUrl ? (
            <Image
              src={note.playerPhotoUrl}
              alt={note.playerName}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full border object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-neutral-100">
              <User className="h-4 w-4 text-neutral-400" />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className={`h-3.5 w-3.5 shrink-0 ${style.iconColor}`} />
              <button onClick={onNavigate} className="text-sm font-semibold hover:underline">
                {note.playerName}
              </button>
              <span className={`text-[10px] font-bold uppercase ${style.iconColor}`}>{style.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-muted-foreground">{fmtRelative(note.createdAt)}</span>
              <button
                onClick={() => onDelete(note)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover/card:opacity-100"
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
          <p className="mt-1 text-[11px] text-muted-foreground">por {note.authorName}</p>
        </div>
      </div>
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
