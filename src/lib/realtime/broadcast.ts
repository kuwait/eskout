// src/lib/realtime/broadcast.ts
// Server-side helper to broadcast mutation events via Supabase Realtime
// Called from Server Actions after successful DB mutations to notify other connected clients
// RELEVANT FILES: src/lib/realtime/types.ts, src/lib/supabase/server.ts, src/actions/players.ts

import type { MutationAction, MutationEvent, RealtimeTable } from './types';

/**
 * Broadcast a mutation event to all connected clients in the same club.
 * Uses the Supabase Realtime HTTP API (REST) instead of WebSocket — much more
 * reliable in serverless environments (Vercel) where WebSocket connections are
 * short-lived and may not deliver messages before the function terminates.
 *
 * Fire-and-forget: errors are logged but never thrown — mutations should
 * succeed even if broadcast fails (graceful degradation).
 */
export async function broadcastMutation(
  clubId: string,
  table: RealtimeTable,
  action: MutationAction,
  userId: string,
  opts?: {
    id?: number | string;
    ids?: (number | string)[];
    fields?: string[];
  }
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const channelName = `club-${clubId}`;

    const payload: MutationEvent = {
      table,
      action,
      by: userId,
      id: opts?.id,
      ids: opts?.ids,
      fields: opts?.fields,
    };

    // Use Supabase Realtime REST API for server-side broadcast
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: channelName,
            event: 'mutation',
            payload,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[Realtime] broadcast HTTP error:', res.status, await res.text());
    }
  } catch (err) {
    // Never throw — broadcast failure should not block mutations
    console.error('[Realtime] broadcast failed:', err);
  }
}

/**
 * Convenience: broadcast a single-row mutation (INSERT/UPDATE/DELETE).
 */
export async function broadcastRowMutation(
  clubId: string,
  table: RealtimeTable,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  userId: string,
  rowId: number | string,
  fields?: string[]
): Promise<void> {
  return broadcastMutation(clubId, table, action, userId, { id: rowId, fields });
}

/**
 * Convenience: broadcast a bulk mutation (e.g. reorder, bulk update).
 */
export async function broadcastBulkMutation(
  clubId: string,
  table: RealtimeTable,
  userId: string,
  ids?: (number | string)[]
): Promise<void> {
  return broadcastMutation(clubId, table, 'BULK', userId, { ids });
}
