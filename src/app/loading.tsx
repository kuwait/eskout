// src/app/loading.tsx
// Root loading skeleton — shown instantly after login redirect while AppShell + page data load
// Mimics the Jogadores page layout for a smooth visual transition
// RELEVANT FILES: src/app/page.tsx, src/components/layout/AppShell.tsx, src/components/players/PlayersView.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function RootLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Page header */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* Search + filters bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-full sm:w-64" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>

      {/* Player cards (mobile) / table rows (desktop) */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
