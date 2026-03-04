// src/hooks/useAgeGroup.tsx
// Age group context and hook for persisting the selected age group across pages
// Stores selection in localStorage and provides it via React Context
// RELEVANT FILES: src/lib/constants.ts, src/components/layout/AgeGroupSelector.tsx, src/app/layout.tsx

'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { AgeGroup } from '@/lib/types';

const STORAGE_KEY = 'eskout-age-group-id';

interface AgeGroupContextValue {
  ageGroups: AgeGroup[];
  selectedId: number | null;
  selected: AgeGroup | null;
  setSelectedId: (id: number) => void;
}

const AgeGroupContext = createContext<AgeGroupContextValue>({
  ageGroups: [],
  selectedId: null,
  selected: null,
  setSelectedId: () => {},
});

/** Read stored age group ID from localStorage, validated against available groups */
function getInitialAgeGroupId(ageGroups: AgeGroup[]): number | null {
  if (ageGroups.length === 0) return null;

  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const id = parseInt(stored, 10);
      if (ageGroups.some((ag) => ag.id === id)) return id;
    }
  }

  // Default: first age group
  return ageGroups[0].id;
}

export function AgeGroupProvider({
  children,
  ageGroups,
}: {
  children: ReactNode;
  ageGroups: AgeGroup[];
}) {
  const [selectedId, setSelectedIdState] = useState<number | null>(
    () => getInitialAgeGroupId(ageGroups)
  );

  const setSelectedId = useCallback((id: number) => {
    setSelectedIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const selected = ageGroups.find((ag) => ag.id === selectedId) ?? null;

  return (
    <AgeGroupContext.Provider value={{ ageGroups, selectedId, selected, setSelectedId }}>
      {children}
    </AgeGroupContext.Provider>
  );
}

export function useAgeGroup() {
  const ctx = useContext(AgeGroupContext);
  if (!ctx) {
    throw new Error('useAgeGroup must be used within AgeGroupProvider');
  }
  return ctx;
}
