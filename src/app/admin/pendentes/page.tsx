// src/app/admin/pendentes/page.tsx
// Admin page for reviewing pending players (scout submissions) and dismissing recruiter/editor additions
// Shows two sections: pending approval + unreviewed (auto-approved)
// RELEVANT FILES: src/actions/players.ts, src/components/layout/Sidebar.tsx

import { getActiveClub } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PendentesClient } from './PendentesClient';

export const dynamic = 'force-dynamic';

export default async function PendentesPage() {
  const ctx = await getActiveClub();

  // Only admin and editor can access
  if (ctx.role !== 'admin' && ctx.role !== 'editor') {
    redirect('/');
  }

  const supabase = await createClient();

  // Fetch pending approval players (scout-created)
  const { data: pendingPlayers } = await supabase
    .from('players')
    .select('id, name, dob, club, position_normalized, created_by, created_at')
    .eq('club_id', ctx.clubId)
    .eq('pending_approval', true)
    .order('created_at', { ascending: false });

  // Fetch unreviewed players (recruiter/editor-created, auto-approved)
  const { data: unreviewedPlayers } = await supabase
    .from('players')
    .select('id, name, dob, club, position_normalized, created_by, created_at')
    .eq('club_id', ctx.clubId)
    .eq('pending_approval', false)
    .eq('admin_reviewed', false)
    .order('created_at', { ascending: false });

  // Collect creator IDs for profile names and membership roles
  const creatorIds = new Set<string>();
  for (const p of [...(pendingPlayers ?? []), ...(unreviewedPlayers ?? [])]) {
    if (p.created_by) creatorIds.add(p.created_by);
  }

  const nameMap = new Map<string, string>();
  const roleMap = new Map<string, string>();
  if (creatorIds.size > 0) {
    const [profilesRes, membershipsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', Array.from(creatorIds)),
      supabase.from('club_memberships').select('user_id, role').eq('club_id', ctx.clubId).in('user_id', Array.from(creatorIds)),
    ]);
    for (const p of profilesRes.data ?? []) {
      nameMap.set(p.id, p.full_name);
    }
    for (const m of membershipsRes.data ?? []) {
      roleMap.set(m.user_id, m.role);
    }
  }

  function mapPlayers(players: typeof pendingPlayers) {
    return (players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      dob: p.dob,
      club: p.club,
      position: p.position_normalized,
      createdBy: nameMap.get(p.created_by ?? '') ?? '—',
      createdByRole: roleMap.get(p.created_by ?? '') ?? '—',
      createdAt: p.created_at,
    }));
  }

  return (
    <PendentesClient
      pendingPlayers={mapPlayers(pendingPlayers)}
      unreviewedPlayers={mapPlayers(unreviewedPlayers)}
      canDismiss={ctx.role === 'admin' || ctx.role === 'editor'}
    />
  );
}
