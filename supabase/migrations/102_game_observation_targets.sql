-- Migration 102: Game observation targets + QSR game linkage
-- Allows coordinators to request specific player observations per scouting game
-- Scouts see targets, submit QSRs linked to the game, coordinators track completion

/* ───────────── Game Observation Targets ───────────── */

CREATE TABLE game_observation_targets (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  game_id     BIGINT NOT NULL REFERENCES scouting_games(id) ON DELETE CASCADE,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  added_by    UUID NOT NULL REFERENCES profiles(id),
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE (game_id, player_id)
);

CREATE INDEX idx_game_targets_game ON game_observation_targets(game_id);
CREATE INDEX idx_game_targets_player ON game_observation_targets(player_id);

-- RLS
ALTER TABLE game_observation_targets ENABLE ROW LEVEL SECURITY;

-- All club members can read targets
CREATE POLICY "game_observation_targets_select"
  ON game_observation_targets FOR SELECT
  USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout', 'recruiter')
  );

-- Admin/editor can insert targets
CREATE POLICY "game_observation_targets_insert"
  ON game_observation_targets FOR INSERT
  WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );

-- Admin/editor or the person who added can delete
CREATE POLICY "game_observation_targets_delete"
  ON game_observation_targets FOR DELETE
  USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
    OR added_by = auth.uid()
  );

/* ───────────── QSR Game Link ───────────── */

ALTER TABLE quick_scout_reports
  ADD COLUMN IF NOT EXISTS game_id BIGINT REFERENCES scouting_games(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qsr_game ON quick_scout_reports(game_id) WHERE game_id IS NOT NULL;
