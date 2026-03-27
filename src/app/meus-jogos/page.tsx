// src/app/meus-jogos/page.tsx
// Scout-only page showing all assigned games across published rounds
// From here scouts navigate to player profiles to create QSRs with pre-filled match context
// RELEVANT FILES: src/actions/scout-assignments.ts, src/app/meus-jogos/MeusJogosClient.tsx

import { getActiveClub } from '@/lib/supabase/club-context';
import { redirect } from 'next/navigation';
import { getMyAssignedGames } from '@/actions/scout-assignments';
import { MeusJogosClient } from './MeusJogosClient';

export default async function MeusJogosPage() {
  const { role } = await getActiveClub();

  // Only scouts use this page
  if (role !== 'scout') {
    redirect('/observacoes');
  }

  const games = await getMyAssignedGames();

  return <MeusJogosClient games={games} />;
}
