// src/app/master/online/page.tsx
// Online users page — real-time view of platform activity
// Shows: online users, active 24h, peak today, device breakdown, role breakdown, heatmap, activity feed
// RELEVANT FILES: src/app/master/online/OnlinePageClient.tsx, src/actions/presence.ts

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { OnlinePageClient } from './OnlinePageClient';

/* ───────────── Page name mapping ───────────── */

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/jogadores': 'Jogadores',
  '/campo': 'Plantel',
  '/campo/real': 'Plantel',
  '/campo/sombra': 'Plantel Sombra',
  '/pipeline': 'Pipeline',
  '/posicoes': 'Posições',
  '/calendario': 'Calendário',
  '/alertas': 'Alertas',
  '/exportar': 'Exportar',
  '/submeter': 'Submeter Relatório',
  '/meus-relatorios': 'Meus Relatórios',
  '/meus-jogadores': 'Meus Jogadores',
  '/preferencias': 'Preferências',
  '/definicoes': 'Definições',
  '/admin/pendentes': 'Pendentes',
  '/admin/relatorios': 'Relatórios Admin',
  '/master': 'Gestão',
  '/master/online': 'Online',
};

function getPageLabel(path: string | null): string {
  if (!path) return '—';
  // Exact match
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  // Player profile
  if (/^\/jogadores\/\d+$/.test(path)) return 'Perfil Jogador';
  // Partial match
  for (const [prefix, label] of Object.entries(PAGE_LABELS)) {
    if (path.startsWith(prefix) && prefix !== '/') return label;
  }
  return path;
}

export default async function OnlinePage() {
  const supabase = await createClient();
  const service = await createServiceClient();

  const now = new Date();
  const nowIso = now.toISOString();
  // Threshold: 6 min to match 5-min heartbeat interval with margin
  const twoMinAgo = new Date(now.getTime() - 6 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().slice(0, 10);

  // Update current user's presence so they appear in the list immediately
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await service
      .from('profiles')
      .update({ last_seen_at: nowIso, last_page: '/master/online', last_device: 'desktop' })
      .eq('id', user.id);
  }

  // Get test club IDs to exclude from all queries
  const { data: testClubs } = await service
    .from('clubs')
    .select('id')
    .eq('is_test', true);
  const testClubIds = (testClubs ?? []).map((c) => c.id);

  // Get user IDs that ONLY belong to test clubs (exclude from stats)
  let testUserIds: string[] = [];
  if (testClubIds.length > 0) {
    const { data: testMemberships } = await service
      .from('club_memberships')
      .select('user_id')
      .in('club_id', testClubIds);
    const testOnlyUserIdSet = new Set((testMemberships ?? []).map((m) => m.user_id));
    // Remove users who also belong to real clubs
    const { data: realMemberships } = await service
      .from('club_memberships')
      .select('user_id')
      .not('club_id', 'in', `(${testClubIds.join(',')})`);
    for (const m of (realMemberships ?? [])) {
      testOnlyUserIdSet.delete(m.user_id);
    }
    testUserIds = [...testOnlyUserIdSet];
  }

  // Also exclude superadmin-only users (no club membership at all)
  const { data: allMembershipUserIds } = await service
    .from('club_memberships')
    .select('user_id');
  const usersWithClub = new Set((allMembershipUserIds ?? []).map((m) => m.user_id));

  const [onlineRes, recentRes, active24hRes, peakRes, membershipsRes, heatmapRes, activityRes] = await Promise.all([
    // Online now
    service
      .from('profiles')
      .select('id, full_name, last_seen_at, last_page, last_device, session_started_at')
      .gte('last_seen_at', twoMinAgo)
      .order('last_seen_at', { ascending: false }),
    // Active 24h
    service
      .from('profiles')
      .select('id, full_name, last_seen_at, last_page, last_device, session_started_at')
      .gte('last_seen_at', twentyFourHoursAgo)
      .order('last_seen_at', { ascending: false }),
    // Count active 24h (we'll count after filtering)
    service
      .from('profiles')
      .select('id, is_superadmin')
      .gte('last_seen_at', twentyFourHoursAgo),
    // Peak today
    service
      .from('platform_daily_stats')
      .select('peak_online, peak_online_at')
      .eq('date', today)
      .maybeSingle(),
    // All memberships for user→club+role mapping (exclude test clubs)
    testClubIds.length > 0
      ? service
          .from('club_memberships')
          .select('user_id, role, clubs(name)')
          .not('club_id', 'in', `(${testClubIds.join(',')})`)
      : service
          .from('club_memberships')
          .select('user_id, role, clubs(name)'),
    // Heatmap: activity from status_history (last 30 days)
    service
      .from('status_history')
      .select('created_at')
      .gte('created_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5000),
    // Activity feed: recent actions from status_history
    service
      .from('status_history')
      .select('id, player_id, field_changed, old_value, new_value, changed_by, created_at, notes, players(name), profiles!status_history_changed_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Filter out test-only users (users who only belong to test clubs or have no club at all)
  const isRealUser = (id: string) => !testUserIds.includes(id) && usersWithClub.has(id);

  // Build club+role map per user
  const clubMap: Record<string, { clubName: string; role: string }[]> = {};
  for (const m of (membershipsRes.data ?? [])) {
    const club = m.clubs as unknown as { name: string } | null;
    if (!clubMap[m.user_id]) clubMap[m.user_id] = [];
    clubMap[m.user_id].push({
      clubName: club?.name ?? '?',
      role: m.role,
    });
  }

  // Map users
  const mapUser = (p: { id: string; full_name: string | null; last_seen_at: string; last_page?: string | null; last_device?: string | null; session_started_at?: string | null }) => ({
    id: p.id,
    fullName: p.full_name ?? 'Sem nome',
    lastSeenAt: p.last_seen_at,
    page: getPageLabel(p.last_page ?? null),
    rawPage: p.last_page ?? null,
    device: (p.last_device as 'mobile' | 'desktop' | null) ?? null,
    sessionStartedAt: p.session_started_at ?? null,
    clubs: clubMap[p.id] ?? [],
  });

  const onlineUsers = (onlineRes.data ?? []).filter((p) => isRealUser(p.id)).map(mapUser);
  const recentUsers = (recentRes.data ?? []).filter((p) => isRealUser(p.id)).map(mapUser);

  // Count active 24h excluding test users
  const active24hFiltered = (active24hRes.data ?? []).filter((p) => isRealUser(p.id)).length;

  // Build heatmap data: [dayOfWeek][hour] = count
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const row of (heatmapRes.data ?? [])) {
    const d = new Date(row.created_at);
    const day = d.getDay(); // 0=Sun
    const hour = d.getHours();
    heatmap[day][hour]++;
  }

  // Activity feed — resolve contact_assigned_to UUIDs to names
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const contactUuids = new Set<string>();
  for (const a of activityRes.data ?? []) {
    if (a.field_changed === 'contact_assigned_to') {
      if (a.old_value && uuidPattern.test(a.old_value)) contactUuids.add(a.old_value);
      if (a.new_value && uuidPattern.test(a.new_value)) contactUuids.add(a.new_value);
    }
  }
  const contactNameMap = new Map<string, string>();
  if (contactUuids.size > 0) {
    const { data: contactProfiles } = await service
      .from('profiles')
      .select('id, full_name')
      .in('id', [...contactUuids]);
    for (const p of contactProfiles ?? []) {
      contactNameMap.set(p.id, p.full_name ?? p.id);
    }
  }

  const activityFeed = (activityRes.data ?? []).map((a) => {
    let oldValue = a.old_value;
    let newValue = a.new_value;
    // Replace UUIDs with names for contact_assigned_to
    if (a.field_changed === 'contact_assigned_to') {
      if (oldValue && contactNameMap.has(oldValue)) oldValue = contactNameMap.get(oldValue)!;
      if (newValue && contactNameMap.has(newValue)) newValue = contactNameMap.get(newValue)!;
    }
    return {
      id: a.id,
      playerName: (a.players as unknown as { name: string } | null)?.name ?? '?',
      playerId: a.player_id,
      userName: (a.profiles as unknown as { full_name: string } | null)?.full_name ?? '?',
      field: a.field_changed,
      oldValue,
      newValue,
      notes: a.notes,
      createdAt: a.created_at,
    };
  });

  // IDs to exclude from client-side polling (test-only users + users with no club)
  const { data: allProfiles } = await service.from('profiles').select('id');
  const excludedUserIds = (allProfiles ?? [])
    .filter((p) => !isRealUser(p.id))
    .map((p) => p.id);

  return (
    <OnlinePageClient
      initialOnline={onlineUsers}
      initialRecent={recentUsers}
      initialActive24h={active24hFiltered}
      peakToday={peakRes.data?.peak_online ?? 0}
      peakTodayAt={peakRes.data?.peak_online_at ?? null}
      heatmap={heatmap}
      activityFeed={activityFeed}
      excludedUserIds={excludedUserIds}
    />
  );
}
