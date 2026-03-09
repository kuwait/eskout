// src/components/ui/StaleDataBanner.tsx
// Banner shown when data has been modified by another user while viewing
// Displays a non-intrusive notification with a reload button
// RELEVANT FILES: src/lib/realtime/RealtimeProvider.tsx, src/hooks/useRealtimeTable.ts, src/components/players/PlayerProfile.tsx

'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StaleDataBannerProps {
  /** Whether to show the banner */
  visible: boolean;
  /** Custom message (default: "Dados alterados por outro utilizador") */
  message?: string;
  /** Called when user clicks reload */
  onReload: () => void;
}

export function StaleDataBanner({
  visible,
  message = 'Dados alterados por outro utilizador',
  onReload,
}: StaleDataBannerProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
      <span>{message}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
        onClick={onReload}
      >
        <RefreshCw className="mr-1 h-3 w-3" />
        Recarregar
      </Button>
    </div>
  );
}
