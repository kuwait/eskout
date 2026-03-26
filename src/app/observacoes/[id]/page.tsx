// src/app/observacoes/[id]/page.tsx
// Round detail page — shows availability matrix (admin/editor) or own availability (scout)
// Server component that fetches round, availability, and club scouts
// RELEVANT FILES: src/actions/scouting-rounds.ts, src/actions/scout-availability.ts, src/app/observacoes/[id]/RoundDetailClient.tsx

export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getActiveClub } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { mapScoutingRoundRow } from '@/lib/supabase/mappers';
import { getScoutAvailability, getClubScouts } from '@/actions/scout-availability';
import { RoundDetailClient } from './RoundDetailClient';
import type { ScoutingRoundRow } from '@/lib/types';

export default async function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roundId = parseInt(id, 10);
  if (isNaN(roundId)) notFound();

  const { clubId, role, userId } = await getActiveClub();
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

  // Fetch availability + scouts in parallel
  const [availability, scouts] = await Promise.all([
    getScoutAvailability(roundId),
    (role === 'admin' || role === 'editor') ? getClubScouts() : Promise.resolve([]),
  ]);

  return (
    <RoundDetailClient
      round={round}
      availability={availability}
      scouts={scouts}
      userRole={role}
      userId={userId}
    />
  );
}
