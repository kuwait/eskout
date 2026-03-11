// src/app/pipeline/loading.tsx
// Loading skeleton for pipeline page — Kanban columns or list view
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/pipeline/page.tsx, src/components/pipeline/PipelineView.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function PipelineLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-6 w-10 rounded-full" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Search */}
      <Skeleton className="mb-4 h-10 w-full sm:w-64" />

      {/* Kanban columns (desktop) */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        {[1, 2, 3, 4].map((col) => (
          <div key={col} className="space-y-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            {[1, 2, 3].map((card) => (
              <Skeleton key={card} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>

      {/* List rows (mobile) */}
      <div className="space-y-2 lg:hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
