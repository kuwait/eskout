// src/app/admin/pendentes/page.tsx
// "Jogadores Adicionados" — per-user notification list of players added by others
// Admin/editor sees all players created by other users, minus their own dismissals
// RELEVANT FILES: src/actions/players.ts, src/app/admin/pendentes/PendentesClient.tsx

import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PendentesClient } from './PendentesClient';

export default async function PendentesPage() {
  const ctx = await getAuthContext();

  // Only admin and editor can access
  if (ctx.role !== 'admin' && ctx.role !== 'editor') {
    redirect('/');
  }

  const supabase = await createClient();
  const userId = ctx.userId;

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

  // Paginated fetch — bypasses Supabase's 1000-row default limit. ONE pass over all
  // manually-created players (created_by IS NOT NULL); we derive both `others` (for the
  // inbox) and the full set (for creator/approver name resolution) in JS instead of two
  // separate paginated fetches (was 2N round-trips, now N).
  const FETCH_PAGE = 1000;
  async function fetchManualPlayers() {
    const all: PlayerRow[] = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('players')
        .select(playerColumns)
        .eq('club_id', ctx.clubId)
        .not('created_by', 'is', null)
        .order('created_at', { ascending: false })
        .range(page * FETCH_PAGE, (page + 1) * FETCH_PAGE - 1);
      const rows = (data ?? []) as PlayerRow[];
      all.push(...rows);
      hasMore = rows.length === FETCH_PAGE;
      page++;
    }
    return all;
  }

  // Fetch dismissals + manual players in parallel
  const [dismissedRes, allClubPlayers] = await Promise.all([
    supabase.from('player_added_dismissals').select('player_id').eq('user_id', userId),
    fetchManualPlayers(),
  ]);
  const dismissedIds = new Set((dismissedRes.data ?? []).map((d) => d.player_id));
  const otherPlayers = allClubPlayers.filter((p) => p.created_by !== userId);

  // Editor: exclude players created by admins (editors only see notifications from equal/lower roles)
  let filteredOthers = otherPlayers;
  if (ctx.role === 'editor') {
    const { data: adminMembers } = await supabase
      .from('club_memberships')
      .select('user_id')
      .eq('club_id', ctx.clubId)
      .eq('role', 'admin');
    const adminIds = new Set((adminMembers ?? []).map(m => m.user_id));
    filteredOthers = otherPlayers.filter((p) => !p.created_by || !adminIds.has(p.created_by));
  }

  // Filter out dismissed players (only for notification lists, not full history)
  const undismissed = filteredOthers.filter((p) => !dismissedIds.has(p.id));

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
