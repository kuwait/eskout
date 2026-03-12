// src/app/comparar/page.tsx
// Player comparison page — side-by-side comparison of 2-3 players
// Fetches player data + evaluations server-side, renders via client component
// RELEVANT FILES: src/app/comparar/ComparePageClient.tsx, src/lib/supabase/queries.ts, src/components/players/PlayerProfile.tsx

import { getActiveClub } from '@/lib/supabase/club-context';
import { redirect } from 'next/navigation';
import { getPlayerById, getScoutEvaluations, getScoutingReports } from '@/lib/supabase/queries';
import { getPickerPlayers } from '@/actions/player-lists';
import { getSavedComparisons } from '@/actions/comparisons';
import { ComparePageClient } from './ComparePageClient';
import type { Player, ScoutEvaluation, ScoutingReport } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface CompareBundle {
  player: Player;
  reports: ScoutingReport[];
  evaluations: ScoutEvaluation[];
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const ctx = await getActiveClub();
  if (ctx.role === 'scout') redirect('/');

  const { ids } = await searchParams;
  const playerIds = (ids ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n))
    .slice(0, 3);

  /* Fetch picker players + saved comparisons + all player bundles in parallel */
  const [allPlayers, savedComparisons] = await Promise.all([
    getPickerPlayers(),
    getSavedComparisons(),
  ]);
  const bundles: CompareBundle[] = [];
  if (playerIds.length > 0) {
    const results = await Promise.all(
      playerIds.map(async (id): Promise<CompareBundle | null> => {
        const [player, reports, evaluations] = await Promise.all([
          getPlayerById(id),
          getScoutingReports(id),
          getScoutEvaluations(id),
        ]);
        if (!player) return null;

        // Compute hybrid rating
        const reportRatings = reports.filter((r) => r.rating !== null).map((r) => r.rating!);
        const scoutRatings = evaluations.map((e) => e.rating);
        const allRatings = [...reportRatings, ...scoutRatings];
        if (allRatings.length > 0) {
          player.reportAvgRating = Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10) / 10;
          player.reportRatingCount = allRatings.length;
        }

        return { player, reports, evaluations };
      }),
    );
    for (const r of results) {
      if (r) bundles.push(r);
    }
  }

  return (
    <ComparePageClient
      bundles={bundles}
      allPlayers={allPlayers}
      savedComparisons={savedComparisons}
      userRole={ctx.role}
      hideScoutingData={ctx.role === 'recruiter'}
    />
  );
}
