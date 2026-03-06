// src/hooks/useResizableColumns.ts
// Hook for resizable table columns via mouse drag on column edge handles
// Stores widths in state with optional localStorage persistence
// RELEVANT FILES: src/components/players/PlayerTable.tsx

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// Bump version when column config changes to invalidate stale widths
const STORAGE_KEY = 'eskout-col-widths-v2';
const DEFAULT_MIN_WIDTH = 50;

interface UseResizableColumnsOptions {
  /** Column keys in order */
  columnKeys: string[];
  /** Default widths per column key */
  defaultWidths: Record<string, number>;
  /** Minimum widths per column key (optional — falls back to 50px) */
  minWidths?: Record<string, number>;
  /** Persist to localStorage */
  persist?: boolean;
}

export function useResizableColumns({ columnKeys, defaultWidths, minWidths, persist = true }: UseResizableColumnsOptions) {
  // Initialize with defaults to avoid hydration mismatch (server has no localStorage)
  const [widths, setWidths] = useState<Record<string, number>>({ ...defaultWidths });

  // Load persisted widths after mount (client-only)
  useEffect(() => {
    if (!persist) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, [persist]);

  const tableRef = useRef<HTMLTableElement | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);

  const updateWidth = useCallback((key: string, newWidth: number) => {
    setWidths((prev) => {
      const next = { ...prev, [key]: newWidth };
      if (persist) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [persist]);

  const handleMouseDown = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    activeKeyRef.current = key;
    startXRef.current = e.clientX;
    startWidthRef.current = widths[key] ?? defaultWidths[key];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const colMin = minWidths?.[activeKeyRef.current!] ?? DEFAULT_MIN_WIDTH;
      const newWidth = Math.max(colMin, startWidthRef.current + delta);
      updateWidth(key, newWidth);
    };

    const handleMouseUp = () => {
      activeKeyRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [widths, defaultWidths, minWidths, updateWidth]);

  /** Double-click auto-fit: find the table in DOM, measure content of all cells in the column */
  const handleDoubleClick = useCallback((key: string) => {
    const table = tableRef.current;
    // tableRef may point to the <table> or a wrapper <div> — find the actual <table>
    const tableEl = table?.tagName === 'TABLE' ? table : table?.querySelector('table');
    if (!tableEl) return;

    const colIndex = columnKeys.indexOf(key);
    if (colIndex < 0) return;

    const colMin = minWidths?.[key] ?? DEFAULT_MIN_WIDTH;
    const PADDING = 24; // cell horizontal padding (12px each side)
    let maxContentWidth = colMin;

    // Measure every row's cell at this column index
    const rows = tableEl.querySelectorAll('tr');
    rows.forEach((row) => {
      const cell = row.children[colIndex] as HTMLTableCellElement | undefined;
      if (!cell) return;

      // Measure all direct children's natural width
      let cellContentWidth = 0;
      Array.from(cell.children).forEach((child) => {
        const el = child as HTMLElement;
        cellContentWidth = Math.max(cellContentWidth, el.scrollWidth);
      });
      // Fallback: if no children, use cell's own scrollWidth
      if (cellContentWidth === 0) cellContentWidth = cell.scrollWidth;

      maxContentWidth = Math.max(maxContentWidth, cellContentWidth + PADDING);
    });

    updateWidth(key, maxContentWidth);
  }, [columnKeys, minWidths, updateWidth]);

  return { widths, handleMouseDown, handleDoubleClick, tableRef, columnKeys };
}
