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

  const initialData = pipelineData.data as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    players: any[];
    contact_purposes: { player_id: number; purpose_label: string }[];
    training_sessions?: {
      id: number;
      player_id: number;
      training_date: string;
      session_time: string | null;
      status: string;
      escalao: string | null;
      location: string | null;
      has_evaluation: boolean;
    }[];
  } | null;
  const clubMembers = profiles.map((p) => ({ id: p.id, fullName: p.fullName }));

  return (
    <div className="max-w-full p-4 lg:p-6">
      <PipelineView
        clubId={clubId}
        initialPlayers={initialData?.players ?? []}
        initialContactPurposes={initialData?.contact_purposes ?? []}
        initialTrainingSessions={initialData?.training_sessions ?? []}
        initialClubMembers={clubMembers}
        initialPurposes={purposes}
      />
    </div>
  );
}
