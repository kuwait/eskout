// src/actions/presence.ts
// Server Action to update user's presence (heartbeat every 60s)
// Tracks: last seen, current page, device, session duration, daily peak
// RELEVANT FILES: src/components/layout/AppShellClient.tsx, src/app/master/online/page.tsx

'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

/** Session gap threshold — if last_seen_at is older than this, start a new session */
const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes

/** Online threshold — users seen within this window are "online" */
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Update the current user's presence — called every 15min from AppShellClient.
 * Also updates daily peak online count.
 */
export async function updateLastSeen(page?: string, device?: string): Promise<void> {
  // Verify auth with regular client
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = await createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Fetch current session_started_at to detect session gap
  const { data: profile } = await service
    .from('profiles')
    .select('last_seen_at, session_started_at')
    .eq('id', user.id)
    .single();

  // Determine session start — reset if gap > 5 min or no previous session
  const lastSeen = profile?.last_seen_at ? new Date(profile.last_seen_at) : null;
  const gap = lastSeen ? now.getTime() - lastSeen.getTime() : Infinity;
  const sessionStarted = gap > SESSION_GAP_MS
    ? nowIso
    : (profile?.session_started_at ?? nowIso);

  // Update presence
  await service
    .from('profiles')
    .update({
      last_seen_at: nowIso,
      last_page: page ?? null,
      last_device: device ?? null,
      session_started_at: sessionStarted,
    })
    .eq('id', user.id);

  // Update daily peak — count current online users and compare
  const threshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS).toISOString();
  const { count: onlineNow } = await service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('last_seen_at', threshold);

  const today = now.toISOString().slice(0, 10);

  // Upsert daily stats — update peak if current online > stored peak
  const { data: existing } = await service
    .from('platform_daily_stats')
    .select('peak_online')
    .eq('date', today)
    .maybeSingle();

  if (!existing) {
    await service.from('platform_daily_stats').insert({
      date: today,
      peak_online: onlineNow ?? 0,
      peak_online_at: nowIso,
      total_unique_users: 1,
    });
  } else if ((onlineNow ?? 0) > (existing.peak_online ?? 0)) {
    await service
      .from('platform_daily_stats')
      .update({ peak_online: onlineNow, peak_online_at: nowIso })
      .eq('date', today);
  }
}
