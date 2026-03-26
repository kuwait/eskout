// src/app/pipeline/page.tsx
// Abordagens page with Kanban (desktop) and status list (mobile) views
// Fetches initial pipeline data server-side for instant render, realtime updates client-side
// RELEVANT FILES: src/components/pipeline/PipelineView.tsx, src/hooks/useAgeGroup.tsx, src/actions/pipeline.ts

import { PipelineView } from '@/components/pipeline/PipelineView';
import { getActiveClub } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';

export default async function PipelinePage() {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  // Fetch initial pipeline data server-side (no age group filter — shows all by default)
  // PipelineView will refetch client-side when user selects a specific age group
  const { data } = await supabase.rpc('get_pipeline_players', {
    p_club_id: clubId,
    p_age_group_id: null,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialData = data as { players: any[]; contact_purposes: { player_id: number; purpose_label: string }[] } | null;

  return (
    <div className="max-w-full p-4 lg:p-6">
      <PipelineView
        clubId={clubId}
        initialPlayers={initialData?.players ?? []}
        initialContactPurposes={initialData?.contact_purposes ?? []}
      />
    </div>
  );
}
