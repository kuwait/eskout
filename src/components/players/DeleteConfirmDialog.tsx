// src/components/players/DeleteConfirmDialog.tsx
// Deletion confirmation dialog that requires typing ELIMINAR to unlock the delete button.
// Extracted from PlayerProfile.tsx to reduce file size and improve modularity.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/actions/players.ts

'use client';

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ───────────── Delete Confirm Dialog — type ELIMINAR to unlock ───────────── */

export function DeleteConfirmDialog({ open, onOpenChange, playerName, isDeleting, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playerName: string;
  isDeleting: boolean;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const isUnlocked = confirmText === 'ELIMINAR';

  // Reset text when dialog opens/closes
  /* eslint-disable react-hooks/set-state-in-effect -- resets form state when dialog closes */
  useEffect(() => { if (!open) setConfirmText(''); }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar jogador?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Isto irá eliminar permanentemente <strong>{playerName}</strong> e todos os dados associados
                (notas, histórico, relatórios). Esta ação não pode ser revertida.
              </p>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">
                  Escreve <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-600">ELIMINAR</span> para confirmar
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="ELIMINAR"
                  className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium tracking-wider outline-none transition-colors focus:border-red-300 focus:ring-1 focus:ring-red-200 placeholder:text-neutral-300"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting || !isUnlocked}
            className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
          >
            {isDeleting ? 'A eliminar...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
