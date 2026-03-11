// src/app/admin/pendentes/loading.tsx
// Loading skeleton for added players notification page
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/admin/pendentes/page.tsx, src/app/admin/pendentes/PendentesClient.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function PendentesLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-6 w-8 rounded-full" />
      </div>

      {/* Player cards */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
