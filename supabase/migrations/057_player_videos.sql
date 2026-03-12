-- Migration 057: Player video links (YouTube)
-- Stores YouTube video URLs with auto-extracted metadata (title, thumbnail via oEmbed)
-- Separate table (not a column on players) to support multiple videos per player with metadata

CREATE TABLE IF NOT EXISTS player_videos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id    uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  url        text NOT NULL,
  video_id   text NOT NULL,
  title      text,
  thumbnail  text,
  note       text,
  added_by   uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by player
CREATE INDEX IF NOT EXISTS idx_player_videos_player
  ON player_videos (club_id, player_id);

-- RLS
ALTER TABLE player_videos ENABLE ROW LEVEL SECURITY;

-- All club members can view videos
CREATE POLICY "Users can view club videos"
  ON player_videos FOR SELECT
  USING (
    club_id IN (SELECT user_club_ids(auth.uid()))
  );

-- All roles can add videos
CREATE POLICY "Users can add videos"
  ON player_videos FOR INSERT
  WITH CHECK (
    added_by = auth.uid()
    AND club_id IN (SELECT user_club_ids(auth.uid()))
  );

-- Admin/editor can delete any; scout/recruiter can delete own
CREATE POLICY "Users can delete videos"
  ON player_videos FOR DELETE
  USING (
    club_id IN (SELECT user_club_ids(auth.uid()))
    AND (
      added_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'editor')
        AND club_id = player_videos.club_id
      )
    )
  );
