// src/app/observacoes/[id]/browse-fpf/page.tsx
// FPF live match browser — fullscreen page for discovering and adding FPF games to a round
// Coordinators browse matches by date, filter by escalão/association, and batch-add
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse-by-date.ts, src/actions/scouting-games.ts, ./BrowseFpfClient.tsx

export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { mapScoutingRoundRow } from '@/lib/supabase/mappers';
import { getGamesForRound } from '@/actions/scouting-games';
import { BrowseFpfClient } from './BrowseFpfClient';
import type { ScoutingRoundRow } from '@/lib/types';

export default async function BrowseFpfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roundId = parseInt(id, 10);
  if (isNaN(roundId)) notFound();

  const { clubId, role } = await getAuthContext();

  // Only admin/editor (coordinators) can browse FPF games
  if (role !== 'admin' && role !== 'editor') {
    redirect(`/observacoes/${roundId}`);
  }

  const supabase = await createClient();

  const { data: roundRow } = await supabase
    .from('scouting_rounds')
    .select('*')
    .eq('id', roundId)
    .eq('club_id', clubId)
    .single();

  if (!roundRow) notFound();

  const round = mapScoutingRoundRow(roundRow as ScoutingRoundRow);

  // Can't browse games for closed rounds
  if (round.status === 'closed') {
    redirect(`/observacoes/${roundId}`);
  }

  // Fetch existing games to mark "already added" in the client
  const existingGames = await getGamesForRound(roundId);

  return <BrowseFpfClient round={round} existingGames={existingGames} />;
}
