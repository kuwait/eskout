// src/app/observacoes/[id]/page.tsx
// Round detail page — availability, games, assignments
// Server component that fetches round, availability, games, assignments, and club scouts
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/actions/scout-availability.ts, src/actions/scouting-games.ts, src/actions/scout-assignments.ts

import { notFound } from 'next/navigation';
import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { mapScoutingRoundRow } from '@/lib/supabase/mappers';
import { getScoutAvailability, getClubScouts } from '@/actions/scout-availability';
import { getGamesForRound } from '@/actions/scouting-games';
import { getAssignmentsForRound } from '@/actions/scout-assignments';
import { getTargetsForRound } from '@/actions/game-targets';
import { RoundDetailClient } from './RoundDetailClient';
import type { ScoutingRoundRow } from '@/lib/types';

export default async function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roundId = parseInt(id, 10);
  if (isNaN(roundId)) notFound();

  const { clubId, role, userId } = await getAuthContext();
  const supabase = await createClient();

  // Fetch round
  const { data: roundRow } = await supabase
    .from('scouting_rounds')
    .select('*')
    .eq('id', roundId)
    .eq('club_id', clubId)
    .single();

  if (!roundRow) notFound();

  const round = mapScoutingRoundRow(roundRow as ScoutingRoundRow);
  const canManage = role === 'admin' || role === 'editor';

  // Scouts and recruiters can only see published rounds
  if (!canManage && round.status !== 'published') notFound();

  // Fetch all data in parallel
  const [availability, scouts, games, assignments] = await Promise.all([
    getScoutAvailability(roundId),
    getClubScouts(),
    getGamesForRound(roundId),
    getAssignmentsForRound(roundId),
  ]);

  // Fetch observation targets for all visible games
  const gameIds = games.map((g) => g.id);
  const targetsMap = await getTargetsForRound(roundId, gameIds);
  // Serialize Map to plain object for client
  const targets: Record<number, import('@/lib/types').GameObservationTarget[]> = {};
  for (const [gid, t] of targetsMap) targets[gid] = t;

  // Scouts/recruiters only see games they're assigned to
  const myAssignedGameIds = new Set(
    assignments.filter((a) => a.scoutId === userId && a.status !== 'cancelled').map((a) => a.gameId)
  );
  const visibleGames = canManage ? games : games.filter((g) => myAssignedGameIds.has(g.id));
  const visibleAssignments = canManage
    ? assignments
    : assignments.filter((a) => myAssignedGameIds.has(a.gameId));

  return (
    <RoundDetailClient
      round={round}
      availability={availability}
      scouts={scouts}
      games={visibleGames}
      assignments={visibleAssignments}
      canManage={canManage}
      userId={userId}
      initialTargets={targets}
    />
  );
}
