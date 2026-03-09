-- supabase/migrations/041_last_seen_at.sql
-- Add last_seen_at to profiles for tracking online/active users
-- Updated by client heartbeat every 60 seconds
-- RELEVANT FILES: src/actions/presence.ts, src/app/master/page.tsx

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Index for efficient "online now" and "active 24h" queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles (last_seen_at DESC NULLS LAST);

-- Allow any authenticated user to update their own last_seen_at
-- (the existing profiles UPDATE policy should handle this, but ensure it)
