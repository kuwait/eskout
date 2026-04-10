// src/app/observacoes/page.tsx
// Main scouting observations page — lists scouting rounds for the club
// Admin/editor manage rounds; scouts see published rounds with inline games
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/app/observacoes/ObservacoesClient.tsx

import { getAuthContext } from '@/lib/supabase/club-context';
import { getScoutingRounds } from '@/actions/scouting-rounds';
import { getMyAssignedGames } from '@/actions/scout-assignments';
import { getTargetsForRound } from '@/actions/game-targets';
import { getScoutAvailability } from '@/actions/scout-availability';
import type { ScoutAvailability } from '@/lib/types';
import { ObservacoesClient } from './ObservacoesClient';
import type { AssignedGame } from '@/actions/scout-assignments';
import type { GameObservationTarget } from '@/lib/types';

export default async function ObservacoesPage() {
  const { role, userId } = await getAuthContext();
  const rounds = await getScoutingRounds();
  // Fetch assigned games + targets for ALL roles (everyone sees their assignments inline)
  let scoutGames: AssignedGame[] = [];
  const scoutTargets: Record<number, GameObservationTarget[]> = {};
  const scoutAvailability: Record<number, ScoutAvailability[]> = {};

  // Always fetch — admins/editors also see their assigned games inline
  {
    scoutGames = await getMyAssignedGames();

    // Fetch availability for all published rounds in parallel (was sequential loop)
    const publishedRounds = rounds.filter(r => r.status === 'published');
    const availResults = await Promise.all(publishedRounds.map(r => getScoutAvailability(r.id)));
    for (let i = 0; i < publishedRounds.length; i++) {
      const myAvail = availResults[i].filter(a => a.scoutId === userId);
      if (myAvail.length > 0) scoutAvailability[publishedRounds[i].id] = myAvail;
    }

    // Fetch targets for all rounds in parallel (was sequential loop)
    const gameIds = scoutGames.map((g) => g.gameId);
    if (gameIds.length > 0) {
      const roundIds = [...new Set(scoutGames.map((g) => g.roundId))];
      const targetResults = await Promise.all(
        roundIds.map(roundId => {
          const roundGameIds = scoutGames.filter((g) => g.roundId === roundId).map((g) => g.gameId);
          return getTargetsForRound(roundId, roundGameIds);
        })
      );
      for (const targetsMap of targetResults) {
        for (const [gid, t] of targetsMap) scoutTargets[gid] = t;
      }
    }
  }

  return <ObservacoesClient rounds={rounds} userRole={role} scoutGames={scoutGames} scoutTargets={scoutTargets} scoutAvailability={scoutAvailability} />;
}
