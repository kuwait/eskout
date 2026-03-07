// src/app/jogadores/[id]/page.tsx
// Player profile page — displays full player details with collapsible sections
// Server component that fetches player data, notes, and status history
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/components/players/ObservationNotes.tsx

import { notFound } from 'next/navigation';
import {
  getPlayerById,
  getCurrentUserRole,
  getObservationNotes,
  getScoutEvaluations,
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

  const [player, role, notes, statusHistory, scoutingReports, scoutEvaluations] = await Promise.all([
    getPlayerById(playerId),
    getCurrentUserRole(),
    getObservationNotes(playerId),
    getStatusHistory(playerId),
    getScoutingReports(playerId),
    getScoutEvaluations(playerId),
  ]);

  if (!player) notFound();

  // Compute hybrid rating: report ratings + scout evaluations
  const reportRatings = scoutingReports.filter((r) => r.rating !== null).map((r) => r.rating!);
  const scoutRatings = scoutEvaluations.map((e) => e.rating);
  const allRatings = [...reportRatings, ...scoutRatings];
  if (allRatings.length > 0) {
    player.reportAvgRating = Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10) / 10;
    player.reportRatingCount = allRatings.length;
  }

  // Fetch age group name + current user ID
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const { data: ageGroup } = await supabase
    .from('age_groups')
    .select('name')
    .eq('id', player.ageGroupId)
    .single();

  return (
    <div className="px-3 py-2 sm:p-4 lg:p-6">
      <PlayerProfile
        player={player}
        userRole={role ?? 'scout'}
        notes={notes}
        statusHistory={statusHistory}
        scoutingReports={scoutingReports}
        scoutEvaluations={scoutEvaluations}
        currentUserId={currentUser?.id ?? null}
        ageGroupName={ageGroup?.name ?? null}
      />
    </div>
  );
}
