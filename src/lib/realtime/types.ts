// src/lib/realtime/types.ts
// Type definitions for Supabase Realtime broadcast events
// Defines mutation event shapes and table names for type-safe realtime communication
// RELEVANT FILES: src/lib/realtime/broadcast.ts, src/lib/realtime/RealtimeProvider.tsx, src/hooks/useRealtimeTable.ts

/* ───────────── Realtime Table Names ───────────── */

/** Tables that emit broadcast mutations */
export const REALTIME_TABLES = [
  'players',
  'observation_notes',
  'scouting_reports',
  'scout_evaluations',
  'status_history',
  'calendar_events',
  'club_memberships',
  'player_added_dismissals',
  'user_tasks',
  'training_feedback',
  'user_observation_list',
  'player_lists',
  'player_list_items',
  'saved_comparisons',
  'player_videos',
  'squads',
  'squad_players',
  'scouting_rounds',
  'scouting_games',
  'scout_assignments',
  'scout_availability',
  'game_observation_targets',
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

/* ───────────── Mutation Events ───────────── */

export type MutationAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK' | 'RECONNECT';

export interface MutationEvent {
  /** Which table was mutated */
  table: RealtimeTable;
  /** What kind of mutation */
  action: MutationAction;
  /** Row ID(s) affected — single ID for INSERT/UPDATE/DELETE, undefined for BULK */
  id?: number | string;
  /** IDs affected in bulk operations */
  ids?: (number | string)[];
  /** User ID who triggered the mutation — used to skip own events */
  by: string;
  /** Optional: specific fields that changed (for targeted updates) */
  fields?: string[];
}

/* ───────────── Presence ───────────── */

export interface PresenceState {
  /** Supabase auth user ID */
  userId: string;
  /** User display name */
  userName: string;
  /** Current page path (e.g. '/jogadores/123') */
  page: string;
  /** True if user is actively editing (form open, unsaved changes) */
  editing: boolean;
  /** ISO timestamp of when presence was last updated */
  lastSeen: string;
}

/* ───────────── Connection Status ───────────── */

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/* ───────────── Hook Callbacks ───────────── */

export interface RealtimeTableCallbacks {
  onInsert?: (event: MutationEvent) => void;
  onUpdate?: (event: MutationEvent) => void;
  onDelete?: (event: MutationEvent) => void;
  onBulk?: (event: MutationEvent) => void;
  /** Called when the channel reconnects after being disconnected (e.g. tab was hidden) */
  onReconnect?: (event: MutationEvent) => void;
  /** Called for any event type — convenience when you want the same handler for all */
  onAny?: (event: MutationEvent) => void;
}
