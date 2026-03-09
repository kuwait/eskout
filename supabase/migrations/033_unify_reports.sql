-- 033_unify_reports.sql
-- Unify scout_reports into scouting_reports — single table for all report types
-- PDF extractions and scout submissions live in the same table
-- scout_reports is empty so no data migration needed

-- Step 1: Add submission workflow columns to scouting_reports
ALTER TABLE scouting_reports
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aprovado'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_player_data JSONB;

-- Step 2: Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scouting_reports_author ON scouting_reports(author_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_status ON scouting_reports(status);

-- Step 3: Update RLS policies to handle scout submissions
DROP POLICY IF EXISTS "Club members read scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Club members insert scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Admin/editor manage scouting_reports" ON scouting_reports;

-- Read: club members + own reports
CREATE POLICY "Club members read scouting_reports" ON scouting_reports FOR SELECT
  USING (
    club_id IN (SELECT user_club_ids(auth.uid()))
    OR author_id = auth.uid()
  );

-- Insert: any club member (scouts submit reports)
CREATE POLICY "Club members insert scouting_reports" ON scouting_reports FOR INSERT
  WITH CHECK (
    club_id IN (SELECT user_club_ids(auth.uid()))
  );

-- Update/Delete: admin/editor only
CREATE POLICY "Admin/editor manage scouting_reports" ON scouting_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = scouting_reports.club_id
      AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admin/editor delete scouting_reports" ON scouting_reports FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = scouting_reports.club_id
      AND role IN ('admin', 'editor')
    )
  );

-- Step 4: Drop the empty scout_reports table
DROP TABLE IF EXISTS scout_reports;
