// src/components/layout/AgeGroupSelector.tsx
// Persistent age group selector — dropdown, horizontal tabs, or navigator (arrows + dropdown)
// Can be controlled (value/onChange) or uncontrolled (uses global context)
// RELEVANT FILES: src/hooks/useAgeGroup.tsx, src/hooks/usePageAgeGroup.tsx, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AgeGroup } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AgeGroupSelectorProps {
  /** When false, hides the "Todos" option */
  showAll?: boolean;
  /** Display variant:
   * - 'dropdown': standard select dropdown
   * - 'tabs': horizontal scrollable pills
   * - 'navigator': arrows ← name → on mobile, tabs on desktop
   */
  variant?: 'dropdown' | 'tabs' | 'navigator';
  /** Controlled value — selected age group ID (null = all) */
  value?: number | null;
  /** Controlled onChange */
  onChange?: (id: number | null) => void;
  /** Available age groups (defaults to context) */
  ageGroups?: AgeGroup[];
  /** Custom label for each tab (e.g. birth year instead of name) */
  labelFn?: (ag: AgeGroup) => string;
}

export function AgeGroupSelector({
  showAll = true,
  variant = 'dropdown',
  value,
  onChange,
  ageGroups: ageGroupsProp,
  labelFn,
}: AgeGroupSelectorProps) {
  const ctx = useAgeGroup();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Use controlled props if provided, otherwise fall back to global context
  const ageGroups = ageGroupsProp ?? ctx.ageGroups;
  const selectedId = value !== undefined ? value : ctx.selectedId;
  const setSelectedId = onChange ?? ctx.setSelectedId;

  if (ageGroups.length === 0) return null;

  const getLabel = labelFn ?? ((ag: AgeGroup) => ag.name);

  /* ───────────── Navigator variant (mobile: arrows + dropdown, desktop: tabs) ───────────── */

  if (variant === 'navigator') {
    // Build a virtual list: optionally "Todos" at index 0, then all age groups
    const isAll = selectedId === null;
    const currentIdx = isAll ? -1 : ageGroups.findIndex((ag) => ag.id === selectedId);
    const currentAg = currentIdx >= 0 ? ageGroups[currentIdx] : null;

    // Navigation: "Todos" → first age group → ... → last age group
    const hasPrev = showAll ? currentIdx > 0 || (currentIdx === 0) : currentIdx > 0;
    const hasNext = isAll ? ageGroups.length > 0 : currentIdx < ageGroups.length - 1 && currentIdx >= 0;

    const goPrev = () => {
      if (currentIdx === 0 && showAll) setSelectedId(null);
      else if (currentIdx > 0) setSelectedId(ageGroups[currentIdx - 1].id);
    };
    const goNext = () => {
      if (isAll && ageGroups.length > 0) setSelectedId(ageGroups[0].id);
      else if (currentIdx >= 0 && hasNext) setSelectedId(ageGroups[currentIdx + 1].id);
    };

    return (
      <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-white">
        {/* Previous */}
        <button
          type="button"
          onClick={goPrev}
          disabled={!hasPrev}
          className="flex h-9 w-9 items-center justify-center rounded-l-lg text-neutral-500 transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-20"
          aria-label="Escalão anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Center — tap to open dropdown */}
        <Select
          value={selectedId?.toString() ?? 'all'}
          onValueChange={(val) => setSelectedId(val === 'all' ? null : parseInt(val, 10))}
          open={dropdownOpen}
          onOpenChange={setDropdownOpen}
        >
          <SelectTrigger
            className="h-9 w-auto min-w-[100px] justify-center rounded-none border-x border-y-0 border-neutral-200 bg-transparent px-3 text-sm font-semibold shadow-none focus:ring-0 [&_svg:last-child]:hidden"
            aria-label="Selecionar escalão"
          >
            <SelectValue>
              {currentAg ? getLabel(currentAg) : isAll ? 'Todos' : 'Selecionar'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {showAll && (
              <SelectItem value="all">Todos</SelectItem>
            )}
            {ageGroups.map((ag) => (
              <SelectItem key={ag.id} value={ag.id.toString()}>
                {getLabel(ag)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Next */}
        <button
          type="button"
          onClick={goNext}
          disabled={!hasNext}
          className="flex h-9 w-9 items-center justify-center rounded-r-lg text-neutral-500 transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-20"
          aria-label="Próximo escalão"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  /* ───────────── Tabs variant ───────────── */

  if (variant === 'tabs') {
    return (
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {showAll && (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              selectedId === null
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            )}
          >
            Todos
          </button>
        )}
        {ageGroups.map((ag) => (
          <button
            key={ag.id}
            type="button"
            onClick={() => setSelectedId(ag.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap',
              selectedId === ag.id
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            )}
          >
            {getLabel(ag)}
          </button>
        ))}
      </div>
    );
  }

  /* ───────────── Dropdown variant (default) ───────────── */

  const displayValue = selectedId?.toString() ?? (showAll ? 'all' : 'all');

  return (
    <Select
      value={displayValue}
      onValueChange={(val) => setSelectedId(val === 'all' ? null : parseInt(val, 10))}
    >
      <SelectTrigger className="w-[180px]" aria-label="Selecionar escalão">
        <SelectValue placeholder="Escalão" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className={showAll ? '' : 'hidden'}>
          Todos os escalões
        </SelectItem>
        {ageGroups.map((ag) => (
          <SelectItem key={ag.id} value={ag.id.toString()}>
            {getLabel(ag)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
