-- Migration 050: Personal tasks + pipeline enhancements (meeting attendees, training escalão)
-- Adds user_tasks table for personal TODO lists and new pipeline context fields

-- 1. Pipeline enhancements on players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS meeting_attendees uuid[] DEFAULT '{}';
ALTER TABLE players ADD COLUMN IF NOT EXISTS training_escalao text;

-- 2. Personal tasks table
CREATE TABLE IF NOT EXISTS user_tasks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id   integer REFERENCES players(id) ON DELETE CASCADE,
  title       text NOT NULL,
  due_date    date,
  completed   boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  source      text NOT NULL DEFAULT 'manual',
  pinned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id, completed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_tasks_club ON user_tasks(club_id);

-- Prevent duplicate auto-generated tasks per user+player+source
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tasks_auto_unique
  ON user_tasks(user_id, player_id, source)
  WHERE source != 'manual' AND completed = false;

-- 3. RLS
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

-- Club members can read their own tasks
CREATE POLICY "Users see own tasks"
  ON user_tasks FOR SELECT
  USING (user_id = auth.uid());

-- Admin can see all tasks in their club
CREATE POLICY "Admin sees all club tasks"
  ON user_tasks FOR SELECT
  USING (user_club_role(auth.uid(), club_id) = 'admin');

-- Club members can insert tasks
CREATE POLICY "Members insert tasks"
  ON user_tasks FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())));

-- Users can update their own tasks
CREATE POLICY "Users update own tasks"
  ON user_tasks FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own manual tasks (admin-created tasks cannot be deleted by target)
CREATE POLICY "Users delete own manual tasks"
  ON user_tasks FOR DELETE
  USING (user_id = auth.uid() AND created_by = auth.uid());

-- Admin can delete any task in their club
CREATE POLICY "Admin deletes club tasks"
  ON user_tasks FOR DELETE
  USING (user_club_role(auth.uid(), club_id) = 'admin');
