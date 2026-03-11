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

  const playerColumns = 'id, name, dob, club, position_normalized, created_by, created_at, pending_approval, approved_by';

  interface PlayerRow {
    id: number;
    name: string;
    dob: string;
    club: string;
    position_normalized: string | null;
    created_by: string | null;
    created_at: string;
    pending_approval: boolean | null;
    approved_by: string | null;
  }

  // Paginated fetch — bypasses Supabase's 1000-row default limit
  const FETCH_PAGE = 1000;
  async function fetchPlayerPages(filter: 'others' | 'manual') {
    const all: PlayerRow[] = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      let query = supabase
        .from('players')
        .select(playerColumns)
        .eq('club_id', ctx.clubId)
        .order('created_at', { ascending: false })
        .range(page * FETCH_PAGE, (page + 1) * FETCH_PAGE - 1);
      if (filter === 'others') query = query.neq('created_by', userId);
      if (filter === 'manual') query = query.not('created_by', 'is', null);
      const { data } = await query;
      const rows = (data ?? []) as PlayerRow[];
      all.push(...rows);
      hasMore = rows.length === FETCH_PAGE;
      page++;
    }
    return all;
  }

  // Fetch players created by OTHER users (for notifications) + all manual (for history)
  const [otherPlayers, allClubPlayers] = await Promise.all([
    fetchPlayerPages('others'),
    fetchPlayerPages('manual'),
  ]);

  // Filter out dismissed players (only for notification lists, not full history)
  const undismissed = otherPlayers.filter((p) => !dismissedIds.has(p.id));

  // Collect creator IDs and approver IDs for name resolution (from all club players)
  const userIds = new Set<string>();
  for (const p of allClubPlayers) {
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

  // Full history (all club players, including own + dismissed) — for "Histórico" panel
  const allPlayersMapped = allClubPlayers.map(mapPlayer);

  return <PendentesClient pendingPlayers={pendingPlayers} approvedPlayers={approvedPlayers} allPlayers={allPlayersMapped} />;
}
