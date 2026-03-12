-- Migration 056: Saved player comparisons
-- Allows users to save a set of 2-3 player IDs for quick comparison later
-- Lightweight table — player_ids stored as int[] (no join table needed)

CREATE TABLE IF NOT EXISTS saved_comparisons (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id    uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  player_ids integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_saved_comparisons_user
  ON saved_comparisons (club_id, user_id);

-- RLS
ALTER TABLE saved_comparisons ENABLE ROW LEVEL SECURITY;

-- Users can see all comparisons from their club
CREATE POLICY "Users can view club comparisons"
  ON saved_comparisons FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert their own comparisons
CREATE POLICY "Users can create own comparisons"
  ON saved_comparisons FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own comparisons; admins can delete any
CREATE POLICY "Users can delete own comparisons"
  ON saved_comparisons FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin' AND club_id = saved_comparisons.club_id
    )
  );
