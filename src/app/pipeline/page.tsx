// src/app/pipeline/page.tsx
// Abordagens page with Kanban (desktop) and status list (mobile) views
// Fetches initial pipeline data server-side for instant render, realtime updates client-side
// RELEVANT FILES: src/components/pipeline/PipelineView.tsx, src/hooks/useAgeGroup.tsx, src/actions/pipeline.ts

import { PipelineView } from '@/components/pipeline/PipelineView';
import { getActiveClub } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { getContactPurposes } from '@/actions/contact-purposes';
import { getAllProfiles } from '@/lib/supabase/queries';

export default async function PipelinePage() {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  // Fetch all initial data server-side — avoids client-side server action POSTs on mount
  const [pipelineData, purposes, profiles] = await Promise.all([
    supabase.rpc('get_pipeline_players', {
      p_club_id: clubId,
      p_age_group_id: null,
    }),
    getContactPurposes(),
    getAllProfiles(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialData = pipelineData.data as { players: any[]; contact_purposes: { player_id: number; purpose_label: string }[] } | null;
  const clubMembers = profiles.map((p) => ({ id: p.id, fullName: p.fullName }));

  return (
    <div className="max-w-full p-4 lg:p-6">
      <PipelineView
        clubId={clubId}
        initialPlayers={initialData?.players ?? []}
        initialContactPurposes={initialData?.contact_purposes ?? []}
        initialClubMembers={clubMembers}
        initialPurposes={purposes}
      />
    </div>
  );
}
