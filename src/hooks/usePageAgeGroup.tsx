// src/hooks/usePageAgeGroup.tsx
// Per-page age group selection hook — each page remembers its own selected age group
// Initializes from localStorage per pageId, syncs changes back to localStorage
// RELEVANT FILES: src/hooks/useAgeGroup.tsx, src/components/layout/AgeGroupSelector.tsx

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import type { AgeGroup } from '@/lib/types';

function storageKey(pageId: string) {
  return `eskout-ag-${pageId}`;
}

/** Read stored per-page age group ID from localStorage */
function getStoredId(pageId: string, ageGroups: AgeGroup[], defaultAll: boolean): number | null {
  if (typeof window === 'undefined') return defaultAll ? null : ageGroups[0]?.id ?? null;

  const stored = localStorage.getItem(storageKey(pageId));
  if (stored === 'all') return null;
  if (stored) {
    const id = parseInt(stored, 10);
    if (ageGroups.some((ag) => ag.id === id)) return id;
  }

  // No stored value — use default
  return defaultAll ? null : (ageGroups[0]?.id ?? null);
}

interface UsePageAgeGroupOptions {
  pageId: string;
  /** Default to "all" when no stored value (default: false) */
  defaultAll?: boolean;
}

/**
 * Per-page age group state — independent from the global context.
 * Each page (pipeline, squad-real, squad-shadow) remembers its own selection.
 */
export function usePageAgeGroup({ pageId, defaultAll = false }: UsePageAgeGroupOptions) {
  const { ageGroups } = useAgeGroup();

  const [selectedId, setSelectedIdState] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  const setSelectedId = useCallback((id: number | null) => {
    setSelectedIdState(id);
    localStorage.setItem(storageKey(pageId), id === null ? 'all' : String(id));
  }, [pageId]);

  // Initialize from localStorage once ageGroups are available
  /* eslint-disable react-hooks/set-state-in-effect -- restores persisted state from localStorage after SSR hydration */
  useEffect(() => {
    if (initialized || ageGroups.length === 0) return;
    const restored = getStoredId(pageId, ageGroups, defaultAll);
    setSelectedIdState(restored);
    setInitialized(true);
  }, [ageGroups, initialized, pageId, defaultAll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selected = ageGroups.find((ag) => ag.id === selectedId) ?? null;

  return { ageGroups, selectedId, selected, setSelectedId };
}
