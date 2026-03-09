// src/hooks/useRealtimeTable.ts
// Generic hook for subscribing to Realtime mutation events on a specific table
// Handles debouncing, skip-own-events, and cleanup automatically
// RELEVANT FILES: src/lib/realtime/RealtimeProvider.tsx, src/lib/realtime/types.ts, src/hooks/useRealtimeBadges.ts

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRealtime, EVENT_DEBOUNCE_MS } from '@/lib/realtime/RealtimeProvider';
import type { MutationEvent, RealtimeTable, RealtimeTableCallbacks } from '@/lib/realtime/types';

interface UseRealtimeTableOptions extends RealtimeTableCallbacks {
  /** Whether this subscription is active (default: true) */
  enabled?: boolean;
  /** Debounce window in ms (default: EVENT_DEBOUNCE_MS = 300ms) */
  debounceMs?: number;
}

/**
 * Subscribe to Realtime mutation events for a specific table.
 *
 * Events from the current user are automatically skipped.
 * Rapid-fire events are debounced — multiple events within the debounce
 * window trigger the callback only once (with the last event).
 *
 * @example
 * ```tsx
 * useRealtimeTable('players', {
 *   onAny: () => refetchPlayers(),
 *   onDelete: (e) => removePlayerFromState(e.id),
 * });
 * ```
 */
export function useRealtimeTable(
  table: RealtimeTable,
  options: UseRealtimeTableOptions = {}
): void {
  const { enabled = true, debounceMs = EVENT_DEBOUNCE_MS } = options;
  const realtime = useRealtime();

  // Store callbacks in refs to avoid re-subscribing on every render
  const callbacksRef = useRef(options);
  // eslint-disable-next-line react-hooks/refs -- standard "latest ref" pattern to avoid stale closures in subscriptions
  callbacksRef.current = options;

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingEventRef = useRef<MutationEvent | null>(null);

  const handleEvent = useCallback((event: MutationEvent) => {
    const cbs = callbacksRef.current;

    // If no debounce, fire immediately
    if (debounceMs <= 0) {
      dispatchToCallbacks(event, cbs);
      return;
    }

    // Debounce: store latest event, fire after window
    pendingEventRef.current = event;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const pending = pendingEventRef.current;
      if (pending) {
        dispatchToCallbacks(pending, cbs);
        pendingEventRef.current = null;
      }
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    if (!realtime || !enabled) return;

    const unsub = realtime.bus.onMutation(table, handleEvent);

    return () => {
      unsub();
      clearTimeout(debounceTimerRef.current);
    };
  }, [realtime, table, enabled, handleEvent]);
}

/** Route event to the appropriate callback(s) */
function dispatchToCallbacks(event: MutationEvent, cbs: RealtimeTableCallbacks): void {
  cbs.onAny?.(event);

  switch (event.action) {
    case 'INSERT':
      cbs.onInsert?.(event);
      break;
    case 'UPDATE':
      cbs.onUpdate?.(event);
      break;
    case 'DELETE':
      cbs.onDelete?.(event);
      break;
    case 'BULK':
      cbs.onBulk?.(event);
      break;
  }
}

/**
 * Subscribe to Realtime mutation events for ALL tables.
 * Useful for cross-cutting concerns like badge count updates.
 */
export function useRealtimeAny(
  callback: (event: MutationEvent) => void,
  enabled = true
): void {
  const realtime = useRealtime();
  const callbackRef = useRef(callback);
  // eslint-disable-next-line react-hooks/refs -- standard "latest ref" pattern to avoid stale closures
  callbackRef.current = callback;

  useEffect(() => {
    if (!realtime || !enabled) return;

    const unsub = realtime.bus.onAnyMutation((event) => {
      callbackRef.current(event);
    });

    return () => unsub();
  }, [realtime, enabled]);
}
