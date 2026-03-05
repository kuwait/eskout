// src/components/players/ObservationNotes.tsx
// Displays observation notes for a player and provides an inline form to add new ones
// Notes listed chronologically (newest first) with author, date, match context
// RELEVANT FILES: src/actions/notes.ts, src/components/players/PlayerProfile.tsx, src/lib/types/index.ts

'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createObservationNote } from '@/actions/notes';
import type { ObservationNote } from '@/lib/types';

interface ObservationNotesProps {
  playerId: number;
  notes: ObservationNote[];
}

export function ObservationNotes({ playerId, notes }: ObservationNotesProps) {
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [matchContext, setMatchContext] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!content.trim()) return;
    startTransition(async () => {
      const result = await createObservationNote(playerId, content, matchContext);
      if (result.success) {
        setContent('');
        setMatchContext('');
        setShowForm(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Add note button / form */}
      {!showForm ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Adicionar Nota
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border bg-neutral-50 p-3">
          <Textarea
            placeholder="Escreva a sua observação..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            autoFocus
          />
          <Input
            placeholder="Contexto do jogo (opcional) — ex: Porto vs Benfica Sub-14"
            value={matchContext}
            onChange={(e) => setMatchContext(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isPending || !content.trim()}
            >
              Guardar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setContent('');
                setMatchContext('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Sem notas de observação.</p>
      )}
      {notes.map((note) => (
        <div key={note.id} className="rounded-md border p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{note.authorName}</span>
            <span>{formatDateTime(note.createdAt)}</span>
          </div>
          {note.matchContext && (
            <p className="mb-1 text-xs text-blue-600">{note.matchContext}</p>
          )}
          <p className="whitespace-pre-wrap text-sm">{note.content}</p>
        </div>
      ))}
    </div>
  );
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
