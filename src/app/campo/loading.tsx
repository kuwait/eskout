// src/app/campo/loading.tsx
// Loading skeleton for squad comparison page — Real vs Shadow panels
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/campo/page.tsx, src/components/squad/SquadPanelView.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function CampoLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Header + tabs */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-24" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Position groups */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((group) => (
          <div key={group}>
            <Skeleton className="mb-2 h-5 w-32" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((card) => (
                <Skeleton key={card} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
