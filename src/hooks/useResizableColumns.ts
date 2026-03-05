// src/hooks/useResizableColumns.ts
// Hook for resizable table columns via mouse drag on column edge handles
// Stores widths in state with optional localStorage persistence
// RELEVANT FILES: src/components/players/PlayerTable.tsx

'use client';

import { useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'eskout-col-widths';
const MIN_WIDTH = 50;

interface UseResizableColumnsOptions {
  /** Column keys in order */
  columnKeys: string[];
  /** Default widths per column key */
  defaultWidths: Record<string, number>;
  /** Persist to localStorage */
  persist?: boolean;
}

export function useResizableColumns({ columnKeys, defaultWidths, persist = true }: UseResizableColumnsOptions) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (persist && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Merge stored with defaults so new columns get defaults
          return { ...defaultWidths, ...parsed };
        }
      } catch { /* ignore */ }
    }
    return { ...defaultWidths };
  });

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);

  const handleMouseDown = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    activeKeyRef.current = key;
    startXRef.current = e.clientX;
    startWidthRef.current = widths[key] ?? defaultWidths[key];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(MIN_WIDTH, startWidthRef.current + delta);
      setWidths((prev) => {
        const next = { ...prev, [key]: newWidth };
        if (persist) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        }
        return next;
      });
    };

    const handleMouseUp = () => {
      activeKeyRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [widths, defaultWidths, persist]);

  return { widths, handleMouseDown, columnKeys };
}
