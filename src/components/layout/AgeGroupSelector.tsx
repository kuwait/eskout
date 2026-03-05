// src/components/layout/AgeGroupSelector.tsx
// Persistent age group selector shown at the top of every page
// Filters all views by the selected escalão (age group)
// RELEVANT FILES: src/hooks/useAgeGroup.ts, src/lib/constants.ts, src/app/layout.tsx

'use client';

import { useEffect } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AgeGroupSelectorProps {
  /** When false, hides the "Todos os escalões" option and auto-selects the first age group */
  showAll?: boolean;
}

export function AgeGroupSelector({ showAll = true }: AgeGroupSelectorProps) {
  const { ageGroups, selectedId, setSelectedId } = useAgeGroup();

  // Auto-select first age group when "all" is hidden and nothing is selected
  useEffect(() => {
    if (!showAll && selectedId === null && ageGroups.length > 0) {
      setSelectedId(ageGroups[0].id);
    }
  }, [showAll, selectedId, ageGroups, setSelectedId]);

  if (ageGroups.length === 0) return null;

  // Compute display value — always 'all' on server when showAll=false and nothing selected yet
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
        {/* Always render "all" item so Radix has a matching value on first render */}
        <SelectItem value="all" className={showAll ? '' : 'hidden'}>
          Todos os escalões
        </SelectItem>
        {ageGroups.map((ag) => (
          <SelectItem key={ag.id} value={ag.id.toString()}>
            {ag.name} ({ag.generationYear})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
