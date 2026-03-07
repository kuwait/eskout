// src/app/pipeline/page.tsx
// Abordagens page with Kanban (desktop) and status list (mobile) views
// Shows players grouped by recruitment status with drag-and-drop on desktop
// RELEVANT FILES: src/components/pipeline/PipelineView.tsx, src/hooks/useAgeGroup.tsx, src/actions/pipeline.ts

import { PipelineView } from '@/components/pipeline/PipelineView';

export default function PipelinePage() {
  return (
    <div className="max-w-full overflow-hidden p-4 lg:p-6">
      <PipelineView />
    </div>
  );
}
