// src/app/observacoes/page.tsx
// Main scouting observations page — lists scouting rounds for the club
// Admin/editor manage rounds; scouts see published rounds with inline games
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/app/observacoes/ObservacoesClient.tsx

import { getActiveClub } from '@/lib/supabase/club-context';
import { getScoutingRounds } from '@/actions/scouting-rounds';
import { getMyAssignedGames } from '@/actions/scout-assignments';
import { getTargetsForRound } from '@/actions/game-targets';
import { getScoutAvailability } from '@/actions/scout-availability';
import type { ScoutAvailability } from '@/lib/types';
import { ObservacoesClient } from './ObservacoesClient';
import type { AssignedGame } from '@/actions/scout-assignments';
import type { GameObservationTarget } from '@/lib/types';

export default async function ObservacoesPage() {
  const { role, userId } = await getActiveClub();
  const rounds = await getScoutingRounds();
  const isScout = role === 'scout';
  const isRecruiter = role === 'recruiter';
  const isFieldRole = isScout || isRecruiter;

  // Fetch assigned games + targets for ALL roles (everyone sees their assignments inline)
  let scoutGames: AssignedGame[] = [];
  const scoutTargets: Record<number, GameObservationTarget[]> = {};
  const scoutAvailability: Record<number, ScoutAvailability[]> = {};

  // Always fetch — admins/editors also see their assigned games inline
  {
    scoutGames = await getMyAssignedGames();
    // Fetch availability for each published round
    const publishedRounds = rounds.filter(r => r.status === 'published');
    for (const r of publishedRounds) {
      const avail = await getScoutAvailability(r.id);
      const myAvail = avail.filter(a => a.scoutId === userId);
      if (myAvail.length > 0) scoutAvailability[r.id] = myAvail;
    }
    // Fetch targets for all assigned game IDs
    const gameIds = scoutGames.map((g) => g.gameId);
    if (gameIds.length > 0) {
      // Group by round to fetch targets
      const roundIds = [...new Set(scoutGames.map((g) => g.roundId))];
      for (const roundId of roundIds) {
        const roundGameIds = scoutGames.filter((g) => g.roundId === roundId).map((g) => g.gameId);
        const targetsMap = await getTargetsForRound(roundId, roundGameIds);
        for (const [gid, t] of targetsMap) scoutTargets[gid] = t;
      }
    }
  }

  return <ObservacoesClient rounds={rounds} userRole={role} scoutGames={scoutGames} scoutTargets={scoutTargets} scoutAvailability={scoutAvailability} />;
}
