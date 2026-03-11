// src/app/jogadores/[id]/loading.tsx
// Loading skeleton for player profile page — header, stats, sections
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/PlayerProfile.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerProfileLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Back + actions */}
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      {/* Player header: photo + name + club */}
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Stats pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {[1, 2, 3].map((s) => (
          <div key={s}>
            <Skeleton className="mb-2 h-5 w-36" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
