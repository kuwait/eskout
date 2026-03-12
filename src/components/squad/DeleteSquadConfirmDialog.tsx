// src/components/squad/DeleteSquadConfirmDialog.tsx
// Strong confirmation dialog for deleting a custom squad — must type "eliminar" to confirm
// Prevents accidental deletion. Admin only, cannot delete default squads.
// RELEVANT FILES: src/components/squad/SquadSelector.tsx, src/actions/squads.ts

'use client';

import { useState } from 'react';
import { deleteSquad } from '@/actions/squads';
import type { Squad } from '@/lib/types';

interface DeleteSquadConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squad: Squad;
  onDeleted: () => void;
}

const CONFIRM_WORD = 'eliminar';

export function DeleteSquadConfirmDialog({
  open,
  onOpenChange,
  squad,
  onDeleted,
}: DeleteSquadConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canConfirm = confirmText.toLowerCase() === CONFIRM_WORD;

  async function handleDelete() {
    if (!canConfirm) return;

    setSubmitting(true);
    setError(null);

    const res = await deleteSquad(squad.id);
    setSubmitting(false);

    if (!res.success) {
      setError(res.error ?? 'Erro desconhecido');
      return;
    }

    setConfirmText('');
    onOpenChange(false);
    onDeleted();
  }

  function handleClose() {
    setConfirmText('');
    setError(null);
    onOpenChange(false);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
            Eliminar Plantel
          </h2>

          <p className="mb-4 text-sm text-muted-foreground">
            Tem a certeza que quer eliminar o plantel{' '}
            <span className="font-semibold text-foreground">&quot;{squad.name}&quot;</span>?
            Todos os jogadores serão removidos deste plantel. Esta ação não pode ser desfeita.
          </p>

          <div className="mb-4">
            <label htmlFor="confirm-delete" className="mb-1 block text-sm font-medium">
              Escreva <span className="font-mono font-bold text-red-600 dark:text-red-400">{CONFIRM_WORD}</span> para confirmar
            </label>
            <input
              id="confirm-delete"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-400"
              autoFocus
              disabled={submitting}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              disabled={!canConfirm || submitting}
            >
              {submitting ? 'A eliminar...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
