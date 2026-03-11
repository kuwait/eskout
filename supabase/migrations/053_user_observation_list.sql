-- Migration 053: Personal observation shortlist per user
-- Each user can bookmark players they want to observe/follow
-- Admin can secretly see all users' lists

CREATE TABLE IF NOT EXISTS user_observation_list (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id     uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id   integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One entry per user+player+club
CREATE UNIQUE INDEX IF NOT EXISTS idx_observation_list_unique
  ON user_observation_list(user_id, player_id, club_id);

-- Fast per-user queries
CREATE INDEX IF NOT EXISTS idx_observation_list_user
  ON user_observation_list(user_id, club_id, created_at DESC);

-- Fast admin queries (all entries for a club)
CREATE INDEX IF NOT EXISTS idx_observation_list_club
  ON user_observation_list(club_id, created_at DESC);

-- RLS
ALTER TABLE user_observation_list ENABLE ROW LEVEL SECURITY;

-- Users see own list
CREATE POLICY "Users see own observation list"
  ON user_observation_list FOR SELECT
  USING (user_id = auth.uid());

-- Admin sees all lists in their club (secret)
CREATE POLICY "Admin sees all club observation lists"
  ON user_observation_list FOR SELECT
  USING (user_club_role(auth.uid(), club_id) = 'admin');

-- Members can insert into own list
CREATE POLICY "Members insert own observation list"
  ON user_observation_list FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND club_id IN (SELECT user_club_ids(auth.uid()))
  );

-- Users can update own entries (edit note)
CREATE POLICY "Users update own observation list"
  ON user_observation_list FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete own entries
CREATE POLICY "Users delete own observation list"
  ON user_observation_list FOR DELETE
  USING (user_id = auth.uid());
