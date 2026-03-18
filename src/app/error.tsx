// src/app/error.tsx
// Root error boundary — catches unhandled errors in any route
// Prevents blank white screen, shows friendly message with retry
// RELEVANT FILES: src/app/layout.tsx, src/app/loading.tsx

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root error boundary caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold">Algo correu mal</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Tenta novamente ou recarrega a página.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
      >
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </button>
    </div>
  );
}
