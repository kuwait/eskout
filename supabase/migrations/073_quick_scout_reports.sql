-- Migration 073: Quick Scout Reports — tap-based mobile evaluation
-- Parallel to existing PDF-based scouting_reports and simple scout_evaluations
-- All roles can submit (admin, editor, recruiter, scout)

CREATE TABLE quick_scout_reports (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id         UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES profiles(id),

  -- 5 dimensional ratings (1-5 each, all required)
  rating_tecnica      SMALLINT NOT NULL CHECK (rating_tecnica BETWEEN 1 AND 5),
  rating_tatica       SMALLINT NOT NULL CHECK (rating_tatica BETWEEN 1 AND 5),
  rating_fisico       SMALLINT NOT NULL CHECK (rating_fisico BETWEEN 1 AND 5),
  rating_mentalidade  SMALLINT NOT NULL CHECK (rating_mentalidade BETWEEN 1 AND 5),
  rating_potencial    SMALLINT NOT NULL CHECK (rating_potencial BETWEEN 1 AND 5),

  -- Overall rating (1-5, required)
  rating_overall  SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),

  -- Recommendation
  recommendation  TEXT NOT NULL CHECK (recommendation IN ('Assinar', 'Acompanhar', 'Sem interesse')),

  -- Tags per dimension (text arrays)
  tags_tecnica     TEXT[] DEFAULT '{}',
  tags_tatica      TEXT[] DEFAULT '{}',
  tags_fisico      TEXT[] DEFAULT '{}',
  tags_mentalidade TEXT[] DEFAULT '{}',
  tags_potencial   TEXT[] DEFAULT '{}',

  -- Match context (optional)
  competition     TEXT,
  opponent        TEXT,
  match_date      DATE,

  -- Optional free-text notes
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qsr_player ON quick_scout_reports(player_id);
CREATE INDEX idx_qsr_club ON quick_scout_reports(club_id);
CREATE INDEX idx_qsr_author ON quick_scout_reports(author_id);
CREATE INDEX idx_qsr_created ON quick_scout_reports(created_at DESC);

/* ───────────── RLS ───────────── */

ALTER TABLE quick_scout_reports ENABLE ROW LEVEL SECURITY;

-- Club members can read all quick reports
CREATE POLICY "qsr_select" ON quick_scout_reports
  FOR SELECT USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- All roles can insert
CREATE POLICY "qsr_insert" ON quick_scout_reports
  FOR INSERT WITH CHECK (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- Author can update own reports
CREATE POLICY "qsr_update" ON quick_scout_reports
  FOR UPDATE USING (author_id = auth.uid());

-- Author or admin can delete
CREATE POLICY "qsr_delete" ON quick_scout_reports
  FOR DELETE USING (
    author_id = auth.uid()
    OR club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin')
  );
