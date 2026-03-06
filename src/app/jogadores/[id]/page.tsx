// src/app/jogadores/[id]/page.tsx
// Player profile page — displays full player details with collapsible sections
// Server component that fetches player data, notes, and status history
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/components/players/ObservationNotes.tsx

import { notFound } from 'next/navigation';
import {
  getPlayerById,
  getCurrentUserRole,
  getObservationNotes,
  getScoutingReports,
  getStatusHistory,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { PlayerProfile } from '@/components/players/PlayerProfile';

// Always fetch fresh data — status history and player data change frequently
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const playerId = parseInt(id, 10);

  if (isNaN(playerId)) notFound();

  const [player, role, notes, statusHistory, scoutingReports] = await Promise.all([
    getPlayerById(playerId),
    getCurrentUserRole(),
    getObservationNotes(playerId),
    getStatusHistory(playerId),
    getScoutingReports(playerId),
  ]);

  if (!player) notFound();

  // Fetch age group name for display
  const supabase = await createClient();
  const { data: ageGroup } = await supabase
    .from('age_groups')
    .select('name')
    .eq('id', player.ageGroupId)
    .single();

  return (
    <div className="p-4 lg:p-6">
      <PlayerProfile
        player={player}
        userRole={role ?? 'scout'}
        notes={notes}
        statusHistory={statusHistory}
        scoutingReports={scoutingReports}
        ageGroupName={ageGroup?.name ?? null}
      />
    </div>
  );
}
