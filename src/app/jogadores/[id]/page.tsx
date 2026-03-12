// src/app/jogadores/[id]/page.tsx
// Player profile page — displays full player details with collapsible sections
// Server component that fetches player data, notes, and status history
// RELEVANT FILES: src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx, src/components/players/ObservationNotes.tsx

import type { Metadata } from 'next';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import {
  getPlayerById,
  getCurrentUserRole,
  getObservationNotes,
  getScoutEvaluations,
  getScoutingReports,
  getStatusHistory,
  getTrainingFeedback,
  getAllProfiles,
  getPlayerSquads,
} from '@/lib/supabase/queries';
import { getPlayerVideos } from '@/actions/player-videos';
import { createClient } from '@/lib/supabase/server';
import { PlayerProfile } from '@/components/players/PlayerProfile';
import { getPositionLabel } from '@/lib/constants';

// Always fetch fresh data — status history and player data change frequently
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

/* ───────────── Open Graph metadata for WhatsApp/social sharing ───────────── */

/** Lightweight query using service role — works without user session (for social crawlers) */
async function getPlayerForOg(playerId: number) {
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await supabase
    .from('players')
    .select('name, dob, club, position_normalized, photo_url, zz_photo_url')
    .eq('id', playerId)
    .single();
  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const playerId = parseInt(id, 10);
  if (isNaN(playerId)) return {};

  const player = await getPlayerForOg(playerId);
  if (!player) return {};

  const position = getPositionLabel(player.position_normalized);
  const age = player.dob ? `${new Date().getFullYear() - new Date(player.dob).getFullYear()} anos` : '';
  const parts = [position, player.club, age].filter(Boolean);
  const description = parts.join(' · ');
  const photoUrl = player.photo_url?.startsWith('http') ? player.photo_url
    : player.zz_photo_url?.startsWith('http') ? player.zz_photo_url
    : undefined;

  return {
    title: `${player.name} — Eskout`,
    description,
    openGraph: {
      title: player.name,
      description,
      ...(photoUrl && { images: [{ url: photoUrl, width: 200, height: 200 }] }),
    },
  };
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const playerId = parseInt(id, 10);

  if (isNaN(playerId)) notFound();

  const [player, role, notes, statusHistory, scoutingReports, scoutEvaluations, trainingFeedback, clubProfiles, playerVideos, playerSquads] = await Promise.all([
    getPlayerById(playerId),
    getCurrentUserRole(),
    getObservationNotes(playerId),
    getStatusHistory(playerId),
    getScoutingReports(playerId),
    getScoutEvaluations(playerId),
    getTrainingFeedback(playerId),
    getAllProfiles(),
    getPlayerVideos(playerId),
    getPlayerSquads(playerId),
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

  // Fetch age group name + current user ID + contact assigned name
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const [{ data: ageGroup }, contactProfile] = await Promise.all([
    supabase.from('age_groups').select('name').eq('id', player.ageGroupId).single(),
    player.contactAssignedTo
      ? supabase.from('profiles').select('full_name').eq('id', player.contactAssignedTo).single().then(({ data }) => data)
      : Promise.resolve(null),
  ]);
  // Hydrate the contact name from the joined profile
  if (contactProfile) player.contactAssignedToName = contactProfile.full_name;

  return (
    <div className="px-3 py-2 sm:p-4 lg:p-6">
      <PlayerProfile
        player={player}
        userRole={role ?? 'scout'}
        notes={notes}
        statusHistory={statusHistory}
        scoutingReports={scoutingReports}
        scoutEvaluations={scoutEvaluations}
        trainingFeedback={trainingFeedback}
        playerVideos={playerVideos}
        currentUserId={currentUser?.id ?? null}
        ageGroupName={ageGroup?.name ?? null}
        clubMembers={clubProfiles.map((p) => ({ id: p.id, fullName: p.fullName }))}
        playerSquads={playerSquads}
      />
    </div>
  );
}
