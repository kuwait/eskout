// src/lib/realtime/index.ts
// Re-exports for clean imports from the realtime module
// Usage: import { RealtimeProvider, broadcastMutation } from '@/lib/realtime'
// RELEVANT FILES: src/lib/realtime/types.ts, src/lib/realtime/broadcast.ts, src/lib/realtime/RealtimeProvider.tsx

export { RealtimeProvider, useRealtime } from './RealtimeProvider';
export { broadcastMutation, broadcastRowMutation, broadcastBulkMutation } from './broadcast';
export type {
  RealtimeTable,
  MutationEvent,
  MutationAction,
  PresenceState,
  RealtimeConnectionStatus,
  RealtimeTableCallbacks,
} from './types';
export { REALTIME_TABLES } from './types';
