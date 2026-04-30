// src/hooks/usePersistedBoolean.ts
// Hook for boolean state persisted to localStorage (SSR-safe)
// Used for sidebar collapse states so user choice survives page reloads
// RELEVANT FILES: src/components/layout/Sidebar.tsx, src/components/layout/MobileDrawer.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';

export function usePersistedBoolean(key: string, defaultValue: boolean): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  // Initialize with default to avoid hydration mismatch (server has no localStorage)
  const [value, setValue] = useState<boolean>(defaultValue);

  // Restore from localStorage after mount
  /* eslint-disable react-hooks/set-state-in-effect -- restores persisted state from localStorage after SSR */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === 'true' || stored === 'false') {
        setValue(stored === 'true');
      }
    } catch { /* ignore */ }
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setPersisted = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(key, String(resolved)); } catch { /* ignore */ }
      return resolved;
    });
  }, [key]);

  return [value, setPersisted];
}
