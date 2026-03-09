// src/lib/realtime/broadcast.ts
// Server-side helper to broadcast mutation events via Supabase Realtime
// Called from Server Actions after successful DB mutations to notify other connected clients
// RELEVANT FILES: src/lib/realtime/types.ts, src/lib/supabase/server.ts, src/actions/players.ts

import { createServiceClient } from '@/lib/supabase/server';
import type { MutationAction, MutationEvent, RealtimeTable } from './types';

/**
 * Broadcast a mutation event to all connected clients in the same club.
 * Uses the service role Supabase client (standard JS client, NOT SSR) which
 * supports Realtime properly. Subscribes → sends → unsubscribes.
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
    const supabase = await createServiceClient();
    const channelName = `club-${clubId}`;

    const payload: MutationEvent = {
      table,
      action,
      by: userId,
      id: opts?.id,
      ids: opts?.ids,
      fields: opts?.fields,
    };

    const channel = supabase.channel(channelName);

    // Subscribe first, then send, then clean up
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        supabase.removeChannel(channel);
        reject(new Error('Broadcast subscribe timeout'));
      }, 5000);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          channel
            .send({ type: 'broadcast', event: 'mutation', payload })
            .then(() => {
              supabase.removeChannel(channel);
              resolve();
            })
            .catch((err) => {
              supabase.removeChannel(channel);
              reject(err);
            });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          supabase.removeChannel(channel);
          reject(new Error(`Channel ${status}`));
        }
      });
    });
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
