// src/components/squad/SquadSelector.tsx
// Navigator-style selector for choosing between squads — arrows ← name → with dropdown
// Mirrors AgeGroupSelector navigator pattern. Create/delete managed in admin panel.
// RELEVANT FILES: src/components/layout/AgeGroupSelector.tsx, src/components/squad/SquadPanelView.tsx, src/actions/squads.ts

'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Squad } from '@/lib/types';

interface SquadSelectorProps {
  squads: Squad[];
  selectedSquadId: number | null;
  onSelect: (squadId: number) => void;
}

export function SquadSelector({
  squads,
  selectedSquadId,
  onSelect,
}: SquadSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Hide selector if there are no squads
  if (squads.length === 0) return null;

  const currentIdx = squads.findIndex((s) => s.id === selectedSquadId);
  const current = currentIdx >= 0 ? squads[currentIdx] : null;

  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < squads.length - 1;

  const goPrev = () => {
    if (hasPrev) onSelect(squads[currentIdx - 1].id);
  };
  const goNext = () => {
    if (hasNext) onSelect(squads[currentIdx + 1].id);
  };

  return (
    <div className="inline-flex shrink-0 items-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      {/* Previous */}
      <button
        type="button"
        onClick={goPrev}
        disabled={!hasPrev}
        className="flex h-9 w-9 items-center justify-center rounded-l-lg text-neutral-500 transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-20 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
        aria-label="Plantel anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Center — tap to open dropdown */}
      <Select
        value={selectedSquadId?.toString() ?? ''}
        onValueChange={(val) => onSelect(parseInt(val, 10))}
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
      >
        <SelectTrigger
          className="h-9 w-auto min-w-[100px] max-w-[200px] justify-center rounded-none border-x border-y-0 border-neutral-200 bg-transparent px-3 text-sm font-semibold shadow-none focus:ring-0 dark:border-neutral-700 [&_svg:last-child]:hidden"
          aria-label="Selecionar plantel"
        >
          <SelectValue>
            {current?.name ?? 'Selecionar'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {squads.map((squad) => (
            <SelectItem key={squad.id} value={squad.id.toString()}>
              <span>{squad.name}</span>
              {squad.description && (
                <span className="ml-1.5 text-xs text-muted-foreground">— {squad.description}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Next */}
      <button
        type="button"
        onClick={goNext}
        disabled={!hasNext}
        className="flex h-9 w-9 items-center justify-center rounded-r-lg text-neutral-500 transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-20 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
        aria-label="Próximo plantel"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
