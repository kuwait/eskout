// src/app/calendario/loading.tsx
// Loading skeleton for calendar page — event list with date headers
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/calendario/page.tsx, src/components/calendar/CalendarView.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function CalendarioLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-28" />
        <div className="ml-auto">
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Calendar events */}
      <div className="space-y-4">
        {[1, 2].map((group) => (
          <div key={group}>
            <Skeleton className="mb-2 h-4 w-24" />
            <div className="space-y-2">
              {[1, 2, 3].map((ev) => (
                <Skeleton key={ev} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
