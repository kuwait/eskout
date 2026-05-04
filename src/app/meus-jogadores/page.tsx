// src/app/meus-jogadores/page.tsx
// Personal player list for scouts and recruiters — shows players they've added
// Scouts see pending/approved status; recruiters see all their additions
// RELEVANT FILES: src/actions/players.ts, src/app/jogadores/novo/page.tsx

import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MeusJogadoresClient } from './MeusJogadoresClient';

export default async function MeusJogadoresPage() {
  const ctx = await getAuthContext();

  // Only scouts and recruiters use this page
  if (ctx.role !== 'scout' && ctx.role !== 'recruiter') {
    redirect('/');
  }

  const supabase = await createClient();

  const { data: players } = await supabase
    .from('players')
    .select('id, name, dob, club, position_normalized, pending_approval, admin_reviewed, created_at')
    .eq('club_id', ctx.clubId)
    .eq('created_by', ctx.userId)
    .order('created_at', { ascending: false });

  const mapped = (players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    dob: p.dob,
    club: p.club,
    position: p.position_normalized,
    pendingApproval: p.pending_approval,
    createdAt: p.created_at,
  }));

  return (
    <MeusJogadoresClient
      players={mapped}
      isScout={ctx.role === 'scout'}
    />
  );
}
