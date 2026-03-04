// src/components/layout/AgeGroupSelector.tsx
// Persistent age group selector shown at the top of every page
// Filters all views by the selected escalão (age group)
// RELEVANT FILES: src/hooks/useAgeGroup.ts, src/lib/constants.ts, src/app/layout.tsx

'use client';

import { useAgeGroup } from '@/hooks/useAgeGroup';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AgeGroupSelector() {
  const { ageGroups, selectedId, setSelectedId } = useAgeGroup();

  if (ageGroups.length === 0) return null;

  return (
    <Select
      value={selectedId?.toString() ?? ''}
      onValueChange={(val) => setSelectedId(parseInt(val, 10))}
    >
      <SelectTrigger className="w-[180px]" aria-label="Selecionar escalão">
        <SelectValue placeholder="Escalão" />
      </SelectTrigger>
      <SelectContent>
        {ageGroups.map((ag) => (
          <SelectItem key={ag.id} value={ag.id.toString()}>
            {ag.name} ({ag.generationYear})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
