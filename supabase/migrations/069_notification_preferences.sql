-- Migration 069: User notification preferences
-- Per-user, per-club email notification settings
-- Default: email_on_task_assigned = true (opt-out model)

CREATE TABLE user_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  email_on_task_assigned BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, club_id)
);

CREATE INDEX idx_notification_prefs_user_club ON user_notification_preferences(user_id, club_id);

/* ───────────── RLS ───────────── */

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own preferences
CREATE POLICY "notification_prefs_select_own" ON user_notification_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notification_prefs_insert_own" ON user_notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_prefs_update_own" ON user_notification_preferences
  FOR UPDATE USING (user_id = auth.uid());
