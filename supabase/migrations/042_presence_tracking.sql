-- supabase/migrations/042_presence_tracking.sql
-- Extended presence tracking: current page, device, session duration, daily peak
-- RELEVANT FILES: src/actions/presence.ts, src/app/master/online/page.tsx

-- Current page the user is viewing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_page TEXT;
-- Device type: 'mobile' or 'desktop'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_device TEXT;
-- When the current session started (reset after 5 min inactivity gap)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;

-- Daily platform stats — one row per day, updated by heartbeat
CREATE TABLE IF NOT EXISTS platform_daily_stats (
  date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  peak_online INTEGER DEFAULT 0,
  peak_online_at TIMESTAMPTZ,
  total_unique_users INTEGER DEFAULT 0
);

-- Allow service role to manage (no RLS needed — only accessed server-side)
ALTER TABLE platform_daily_stats ENABLE ROW LEVEL SECURITY;

-- Superadmins can read stats
CREATE POLICY "Superadmins read platform_daily_stats"
  ON platform_daily_stats FOR SELECT
  USING (is_superadmin(auth.uid()));

-- Service role handles inserts/updates (bypasses RLS)
