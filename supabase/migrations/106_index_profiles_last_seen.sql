-- Migration 106: Index on profiles.last_seen_at for fast online user queries
-- The presence heartbeat counts online users via WHERE last_seen_at >= now() - interval
-- Without index: sequential scan on profiles (~1.25s). With index: ~10ms.
-- RELEVANT FILES: src/actions/presence.ts, src/app/master/online/OnlinePageClient.tsx

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_last_seen_at
  ON profiles (last_seen_at DESC NULLS LAST);
