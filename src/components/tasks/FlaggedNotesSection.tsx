// src/components/tasks/FlaggedNotesSection.tsx
// Flagged observation notes panel — shows urgent + important notes with dismiss/edit
// Replaces the old /alertas page, now integrated into the tasks page
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/actions/notes.ts, src/lib/supabase/queries.ts

'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Pencil, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dismissFlaggedNote, updateObservationNote } from '@/actions/notes';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { PRIORITY_STYLE, fmtRelative } from './tasks-utils';
import type { NotePriority } from '@/lib/types';
import type { FlaggedNote } from '@/lib/supabase/queries';

/* ───────────── Flagged Notes Section (replaces /alertas page) ───────────── */

export function FlaggedNotesSection({ notes: initialNotes }: { notes: FlaggedNote[] }) {
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
            <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
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
