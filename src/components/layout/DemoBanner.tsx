// src/components/layout/DemoBanner.tsx
// Sticky banner shown at the top of the app when in demo mode
// Not dismissible — always visible to remind the user they're in read-only mode
// RELEVANT FILES: src/components/layout/AppShellClient.tsx, src/lib/demo-context.tsx

'use client';

import { Eye } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950 sm:text-sm">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span>Modo Demonstração — apenas leitura</span>
    </div>
  );
}
