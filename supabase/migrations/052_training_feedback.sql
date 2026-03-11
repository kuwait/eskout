-- Training feedback: presence tracking + coach feedback after a player trains at the club
-- Light version: presence status, free-text feedback, optional 1-5 rating

CREATE TABLE training_feedback (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id        uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id      integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  author_id      uuid NOT NULL REFERENCES profiles(id),
  training_date  date NOT NULL,
  escalao        text,
  presence       text NOT NULL DEFAULT 'attended'
    CHECK (presence IN ('attended', 'missed', 'rescheduled')),
  feedback       text,
  rating         integer CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_feedback_player ON training_feedback(player_id);
CREATE INDEX idx_training_feedback_club ON training_feedback(club_id);
CREATE INDEX idx_training_feedback_date ON training_feedback(training_date DESC);

-- RLS
ALTER TABLE training_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read training feedback"
  ON training_feedback FOR SELECT
  USING (true);

CREATE POLICY "Staff insert training feedback"
  ON training_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Staff update own feedback"
  ON training_feedback FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Admin delete training feedback"
  ON training_feedback FOR DELETE
  USING (true);
