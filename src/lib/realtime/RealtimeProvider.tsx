// src/lib/realtime/RealtimeProvider.tsx
// Client-side Realtime provider — 1 channel per club, broadcast + presence
// Manages WebSocket lifecycle, idle disconnect, visibility API, and event bus
// RELEVANT FILES: src/lib/realtime/types.ts, src/lib/supabase/client.ts, src/components/layout/AppShellClient.tsx

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  MutationEvent,
  PresenceState,
  RealtimeConnectionStatus,
  RealtimeTable,
} from './types';

/* ───────────── Config ───────────── */

/** Disconnect WebSocket after this many ms of inactivity */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// IDLE_POLL_INTERVAL_MS reserved for future idle-poll feature (30s)

/** Debounce rapid-fire events — batch refetches within this window */
const EVENT_DEBOUNCE_MS = 300;

/* ───────────── Event Bus ───────────── */

type MutationListener = (event: MutationEvent) => void;
type PresenceListener = (presences: PresenceState[]) => void;
type StatusListener = (status: RealtimeConnectionStatus) => void;

interface EventBus {
  /** Subscribe to mutation events for a specific table */
  onMutation: (table: RealtimeTable, listener: MutationListener) => () => void;
  /** Subscribe to all mutation events (any table) */
  onAnyMutation: (listener: MutationListener) => () => void;
  /** Subscribe to presence changes */
  onPresence: (listener: PresenceListener) => () => void;
  /** Subscribe to connection status changes */
  onStatus: (listener: StatusListener) => () => void;
}

/* ───────────── Context ───────────── */

interface RealtimeContextValue {
  /** Event bus for subscribing to realtime events */
  bus: EventBus;
  /** Current connection status */
  status: RealtimeConnectionStatus;
  /** Track presence on a page (call when navigating) */
  trackPresence: (page: string, editing?: boolean) => void;
  /** Current user ID (for skip-own-events logic) */
  currentUserId: string | null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/* ───────────── Provider ───────────── */

interface RealtimeProviderProps {
  children: ReactNode;
  /** Active club ID — channel is scoped to this */
  clubId: string;
  /** Current user ID — used to skip own events */
  userId: string;
  /** Current user display name — used for presence */
  userName: string;
  /** User role — scouts get minimal subscriptions */
  userRole: string;
}

export function RealtimeProvider({
  children,
  clubId,
  userId,
  userName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userRole,
}: RealtimeProviderProps) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [status, setStatus] = useState<RealtimeConnectionStatus>('connecting');

  // Listener maps — use refs to avoid re-creating channel on listener changes
  const mutationListenersRef = useRef(new Map<RealtimeTable | '*', Set<MutationListener>>());
  const presenceListenersRef = useRef(new Set<PresenceListener>());
  const statusListenersRef = useRef(new Set<StatusListener>());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentPageRef = useRef('/');

  /* ───────────── Event Bus Implementation ───────────── */

  const bus = useRef<EventBus>({
    onMutation(table, listener) {
      const map = mutationListenersRef.current;
      if (!map.has(table)) map.set(table, new Set());
      map.get(table)!.add(listener);
      return () => { map.get(table)?.delete(listener); };
    },
    onAnyMutation(listener) {
      const map = mutationListenersRef.current;
      if (!map.has('*')) map.set('*', new Set());
      map.get('*')!.add(listener);
      return () => { map.get('*')?.delete(listener); };
    },
    onPresence(listener) {
      presenceListenersRef.current.add(listener);
      return () => { presenceListenersRef.current.delete(listener); };
    },
    onStatus(listener) {
      statusListenersRef.current.add(listener);
      return () => { statusListenersRef.current.delete(listener); };
    },
  }).current;

  /** Dispatch mutation event to registered listeners */
  const dispatchMutation = useCallback((event: MutationEvent) => {
    // No skip — the extra refetch on the originating tab is harmless since
    // the data is already updated optimistically. Skipping by userId would
    // block updates on the same user's other devices.

    // Table-specific listeners
    mutationListenersRef.current.get(event.table)?.forEach((fn) => fn(event));
    // Wildcard listeners
    mutationListenersRef.current.get('*')?.forEach((fn) => fn(event));
  }, []);

  /** Update connection status and notify listeners */
  const updateStatus = useCallback((newStatus: RealtimeConnectionStatus) => {
    setStatus(newStatus);
    statusListenersRef.current.forEach((fn) => fn(newStatus));
  }, []);

  /* ───────────── Channel Lifecycle ───────────── */

  const connectChannel = useCallback(() => {
    // Clean up existing channel
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const supabase = createClient();
    const channelName = `club-${clubId}`;

    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: true } },
    });

    // Listen to broadcast mutations
    channel.on('broadcast', { event: 'mutation' }, ({ payload }) => {
      dispatchMutation(payload as MutationEvent);
    });

    // Presence tracking
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceState>();
      const presences: PresenceState[] = [];
      for (const key of Object.keys(state)) {
        for (const p of state[key]) {
          presences.push(p as PresenceState);
        }
      }
      presenceListenersRef.current.forEach((fn) => fn(presences));
    });

    channel.subscribe(async (channelStatus) => {
      if (channelStatus === 'SUBSCRIBED') {
        updateStatus('connected');
        // Track presence
        await channel.track({
          userId,
          userName,
          page: currentPageRef.current,
          editing: false,
          lastSeen: new Date().toISOString(),
        } satisfies PresenceState);
      } else if (channelStatus === 'CLOSED' || channelStatus === 'CHANNEL_ERROR') {
        updateStatus('disconnected');
      }
    });

    channelRef.current = channel;
    updateStatus('connecting');
  }, [clubId, userId, userName, dispatchMutation, updateStatus]);

  const disconnectChannel = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      updateStatus('disconnected');
    }
  }, [updateStatus]);

  /* ───────────── Presence Tracking ───────────── */

  const trackPresence = useCallback((page: string, editing = false) => {
    currentPageRef.current = page;
    if (channelRef.current) {
      channelRef.current.track({
        userId,
        userName,
        page,
        editing,
        lastSeen: new Date().toISOString(),
      } satisfies PresenceState);
    }
  }, [userId, userName]);

  /* ───────────── Idle Detection ───────────── */

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current);

    // Reconnect if disconnected due to idle
    if (!channelRef.current) {
      connectChannel();
    }

    idleTimerRef.current = setTimeout(() => {
      // User has been idle — disconnect to save connections
      disconnectChannel();
    }, IDLE_TIMEOUT_MS);
  }, [connectChannel, disconnectChannel]);

  /* ───────────── Visibility API ───────────── */

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        // Tab hidden — disconnect to save connections
        disconnectChannel();
        clearTimeout(idleTimerRef.current);
      } else {
        // Tab visible — reconnect
        connectChannel();
        resetIdleTimer();
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connectChannel, disconnectChannel, resetIdleTimer]);

  /* ───────────── User Activity Listeners ───────────── */

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    const handler = () => resetIdleTimer();

    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handler);
      }
    };
  }, [resetIdleTimer]);

  /* ───────────── Connect on mount, cleanup on unmount ───────────── */

  useEffect(() => {
    // Scouts get minimal realtime — only own report updates
    // Still connect but they'll have fewer listeners registered
    connectChannel();
    resetIdleTimer();

    return () => {
      clearTimeout(idleTimerRef.current);
      disconnectChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]); // Reconnect when club changes

  /* ───────────── Context Value ───────────── */

  const contextValue = useRef<RealtimeContextValue>({
    bus,
    status: 'connecting',
    trackPresence,
    currentUserId: userId,
  });
  // Keep status in sync
  contextValue.current.status = status;
  contextValue.current.trackPresence = trackPresence;

  return (
    <RealtimeContext.Provider value={contextValue.current}>
      {children}
    </RealtimeContext.Provider>
  );
}

/* ───────────── Hook ───────────── */

/**
 * Access the Realtime context. Returns null if used outside RealtimeProvider
 * (e.g. public routes, login page) — consumers should handle this gracefully.
 */
export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

export { EVENT_DEBOUNCE_MS };
