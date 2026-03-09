// src/app/admin/relatorios/loading.tsx
// Loading skeleton for admin reports page — shown during server data fetches
// Mirrors the layout of the real page for smooth transitions
// RELEVANT FILES: src/app/admin/relatorios/page.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function AdminRelatoriosLoading() {
  return (
    <>
      {/* KPI cards skeleton */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-2 h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Highlights skeleton */}
      <div className="mb-4 flex gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-48 shrink-0 rounded-lg" />
        ))}
      </div>

      {/* Search skeleton */}
      <Skeleton className="mb-3 h-10 w-full" />

      {/* Report list skeleton */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </>
  );
}
