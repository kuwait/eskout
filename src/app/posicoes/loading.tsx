// src/app/posicoes/loading.tsx
// Loading skeleton for positions page — position groups with player counts
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/posicoes/page.tsx, src/components/positions/PositionsView.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function PosicoesLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-24" />
      </div>

      {/* Position cards grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
