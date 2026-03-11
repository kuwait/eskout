// src/app/tarefas/loading.tsx
// Loading skeleton for tasks page — task list with sections
// Shown during server data fetch for smooth navigation transitions
// RELEVANT FILES: src/app/tarefas/page.tsx, src/components/tasks/TasksView.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function TarefasLoading() {
  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mx-auto mb-6 flex max-w-5xl items-center gap-3">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-6 w-8 rounded-full" />
        <div className="ml-auto">
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Task list */}
      <div className="mx-auto max-w-2xl space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
