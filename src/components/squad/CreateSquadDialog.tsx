// src/components/squad/CreateSquadDialog.tsx
// Dialog for creating a new custom squad — admin only
// Collects name, type (pre-set), optional description
// RELEVANT FILES: src/components/squad/SquadSelector.tsx, src/actions/squads.ts, src/lib/validators.ts

'use client';

import { useState } from 'react';
import { createSquad } from '@/actions/squads';
import type { Squad, SquadType } from '@/lib/types';

interface AgeGroupOption {
  id: number;
  name: string;
  generationYear: number;
}

interface CreateSquadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-set squad type (determined by which tab the user is on) */
  squadType: SquadType;
  /** Age group ID — auto-set for shadow squads when context already knows it */
  ageGroupId?: number;
  /** Available age groups — when provided and squadType is 'shadow' without ageGroupId, shows a selector */
  ageGroups?: AgeGroupOption[];
  /** Called with the newly created squad */
  onCreated: (squad: Squad) => void;
}

export function CreateSquadDialog({
  open,
  onOpenChange,
  squadType,
  ageGroupId,
  ageGroups,
  onCreated,
}: CreateSquadDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgeGroupId, setSelectedAgeGroupId] = useState<number | undefined>(ageGroupId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether the user needs to pick an age group (shadow without pre-set ageGroupId)
  const needsAgeGroupPicker = squadType === 'shadow' && !ageGroupId && ageGroups && ageGroups.length > 0;
  const resolvedAgeGroupId = ageGroupId ?? selectedAgeGroupId;

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    const res = await createSquad({
      name: name.trim(),
      squadType,
      ageGroupId: resolvedAgeGroupId,
      description: description.trim() || undefined,
    });

    setSubmitting(false);

    if (!res.success) {
      setError(res.error ?? 'Erro desconhecido');
      return;
    }

    // Reset and close
    setName('');
    setDescription('');
    setSelectedAgeGroupId(undefined);
    onOpenChange(false);
    if (res.data) onCreated(res.data);
  }

  function handleClose() {
    setName('');
    setDescription('');
    setSelectedAgeGroupId(undefined);
    setError(null);
    onOpenChange(false);
  }

  const typeLabel = squadType === 'real' ? 'Real' : 'Sombra';

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
          <h2 className="mb-4 text-lg font-semibold">Criar Plantel {typeLabel}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="squad-name" className="mb-1 block text-sm font-medium">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                id="squad-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Ex: ${squadType === 'real' ? 'Sub-15 B' : '2011 (principal)'}`}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-neutral-400"
                maxLength={60}
                autoFocus
                disabled={submitting}
              />
            </div>

            {/* Year selector — only shown for shadow squads without pre-set ageGroupId */}
            {needsAgeGroupPicker && (
              <div>
                <label htmlFor="squad-age-group" className="mb-1 block text-sm font-medium">
                  Ano de nascimento <span className="text-red-500">*</span>
                </label>
                <select
                  id="squad-age-group"
                  value={selectedAgeGroupId ?? ''}
                  onChange={(e) => setSelectedAgeGroupId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  disabled={submitting}
                >
                  <option value="">Selecionar ano...</option>
                  {ageGroups!.map((ag) => (
                    <option key={ag.id} value={ag.id}>{ag.generationYear} ({ag.name})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="squad-desc" className="mb-1 block text-sm font-medium">
                Descrição <span className="text-xs text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="squad-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Campeonato distrital, equipa B"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-neutral-400"
                maxLength={200}
                disabled={submitting}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                disabled={submitting || !name.trim() || (squadType === 'shadow' && !resolvedAgeGroupId)}
              >
                {submitting ? 'A criar...' : 'Criar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
