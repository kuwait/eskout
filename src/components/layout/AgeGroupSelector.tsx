// src/components/layout/AgeGroupSelector.tsx
// Persistent age group selector — dropdown mode or horizontal tabs mode
// Can be controlled (value/onChange) or uncontrolled (uses global context)
// RELEVANT FILES: src/hooks/useAgeGroup.tsx, src/hooks/usePageAgeGroup.tsx, src/lib/constants.ts

'use client';

import { useAgeGroup } from '@/hooks/useAgeGroup';
import { cn } from '@/lib/utils';
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
  /** Use horizontal scrollable tabs instead of dropdown */
  variant?: 'dropdown' | 'tabs';
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

  // Use controlled props if provided, otherwise fall back to global context
  const ageGroups = ageGroupsProp ?? ctx.ageGroups;
  const selectedId = value !== undefined ? value : ctx.selectedId;
  const setSelectedId = onChange ?? ctx.setSelectedId;

  if (ageGroups.length === 0) return null;

  const getLabel = labelFn ?? ((ag: AgeGroup) => ag.name);

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
