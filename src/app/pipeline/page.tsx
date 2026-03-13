// src/app/pipeline/page.tsx
// Abordagens page with Kanban (desktop) and status list (mobile) views
// Shows players grouped by recruitment status with drag-and-drop on desktop
// RELEVANT FILES: src/components/pipeline/PipelineView.tsx, src/hooks/useAgeGroup.tsx, src/actions/pipeline.ts

import { PipelineView } from '@/components/pipeline/PipelineView';
import { getActiveClub } from '@/lib/supabase/club-context';

export default async function PipelinePage() {
  const { clubId } = await getActiveClub();

  return (
    <div className="max-w-full p-4 lg:p-6">
      <PipelineView clubId={clubId} />
    </div>
  );
}
