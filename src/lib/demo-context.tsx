// src/lib/demo-context.tsx
// React context to propagate demo mode flag to client components
// Used by UI components to hide mutation buttons when in demo mode
// RELEVANT FILES: src/components/layout/AppShellClient.tsx, src/lib/supabase/club-context.ts

'use client';

import { createContext, useContext } from 'react';

const DemoContext = createContext(false);

export const DemoProvider = DemoContext.Provider;

/** Returns true when the current club is a demo club (read-only) */
export function useIsDemo(): boolean {
  return useContext(DemoContext);
}
