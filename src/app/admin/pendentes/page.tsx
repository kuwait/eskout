// src/app/admin/pendentes/page.tsx
// "Jogadores Adicionados" — per-user notification list of players added by others
// Admin/editor sees all players created by other users, minus their own dismissals
// RELEVANT FILES: src/actions/players.ts, src/app/admin/pendentes/PendentesClient.tsx

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
  const userId = ctx.userId;

  // Fetch player IDs already dismissed by this user
  const { data: dismissedRows } = await supabase
    .from('player_added_dismissals')
    .select('player_id')
    .eq('user_id', userId);
  const dismissedIds = new Set((dismissedRows ?? []).map((d) => d.player_id));

  // Fetch all players created by OTHER users in this club
  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, name, dob, club, position_normalized, created_by, created_at, pending_approval, approved_by')
    .eq('club_id', ctx.clubId)
    .neq('created_by', userId)
    .order('created_at', { ascending: false });

  if (!allPlayers) {
    return <PendentesClient pendingPlayers={[]} approvedPlayers={[]} />;
  }

  // Filter out dismissed players
  const undismissed = allPlayers.filter((p) => !dismissedIds.has(p.id));

  // Collect creator IDs and approver IDs for name resolution
  const userIds = new Set<string>();
  for (const p of undismissed) {
    if (p.created_by) userIds.add(p.created_by);
    if (p.approved_by) userIds.add(p.approved_by);
  }

  // Resolve names and roles
  const nameMap = new Map<string, string>();
  const roleMap = new Map<string, string>();
  if (userIds.size > 0) {
    const [profilesRes, membershipsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds)),
      supabase.from('club_memberships').select('user_id, role').eq('club_id', ctx.clubId).in('user_id', Array.from(userIds)),
    ]);
    for (const p of profilesRes.data ?? []) {
      nameMap.set(p.id, p.full_name);
    }
    for (const m of membershipsRes.data ?? []) {
      roleMap.set(m.user_id, m.role);
    }
  }

  function mapPlayer(p: typeof undismissed[number]) {
    return {
      id: p.id,
      name: p.name,
      dob: p.dob,
      club: p.club,
      position: p.position_normalized,
      createdBy: nameMap.get(p.created_by ?? '') ?? '—',
      createdByRole: roleMap.get(p.created_by ?? '') ?? '—',
      createdAt: p.created_at,
      approvedByName: p.approved_by ? (nameMap.get(p.approved_by) ?? null) : null,
    };
  }

  // Split: scout-created pending approval vs already approved/auto-approved
  // Scout-created that are still pending OR were approved by someone else (user still needs to dismiss)
  const scoutCreated = undismissed.filter((p) => roleMap.get(p.created_by ?? '') === 'scout');
  const nonScoutCreated = undismissed.filter((p) => roleMap.get(p.created_by ?? '') !== 'scout');

  // Pending = scout-created where pending_approval is still true
  // Approved by others = scout-created where approved_by is set (but user hasn't dismissed)
  const pendingPlayers = scoutCreated.filter((p) => p.pending_approval).map(mapPlayer);
  const approvedByOthers = scoutCreated.filter((p) => !p.pending_approval).map(mapPlayer);
  const approvedPlayers = [...approvedByOthers, ...nonScoutCreated.map(mapPlayer)];

  return <PendentesClient pendingPlayers={pendingPlayers} approvedPlayers={approvedPlayers} />;
}
