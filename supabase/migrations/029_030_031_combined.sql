-- Combined migration for Phase 6: Multi-Tenant
-- Run this in the Supabase SQL Editor in one go
-- Combines: 029_clubs_and_memberships + 030_add_club_id_to_data_tables + 031_club_rls_policies

-- ============================================================
-- 029: CLUBS, CLUB_MEMBERSHIPS, CLUB_AGE_GROUPS
-- ============================================================

CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  features JSONB DEFAULT '{
    "pipeline": true,
    "calendar": true,
    "shadow_squad": true,
    "scouting_reports": true,
    "scout_submissions": true,
    "export": true,
    "positions_view": true,
    "alerts": true
  }',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'scout')),
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_club_memberships_user ON club_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_club ON club_memberships (club_id);

CREATE TABLE IF NOT EXISTS club_age_groups (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  generation_year INT NOT NULL,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, name, season)
);

CREATE INDEX IF NOT EXISTS idx_club_age_groups_club ON club_age_groups (club_id);

-- ============================================================
-- 030: ADD club_id TO DATA TABLES + is_superadmin
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;

ALTER TABLE players ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_players_club ON players (club_id);

ALTER TABLE age_groups ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_age_groups_club ON age_groups (club_id);

ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scouting_reports_club ON scouting_reports (club_id);

ALTER TABLE observation_notes ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_observation_notes_club ON observation_notes (club_id);

ALTER TABLE status_history ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_status_history_club ON status_history (club_id);

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_club ON calendar_events (club_id);

ALTER TABLE scout_evaluations ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scout_evaluations_club ON scout_evaluations (club_id);

ALTER TABLE scout_reports ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scout_reports_club ON scout_reports (club_id);

-- ============================================================
-- 031: CLUB-SCOPED RLS POLICIES
-- ============================================================

-- CLUBS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage clubs"
  ON clubs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true));

CREATE POLICY "Members read own clubs"
  ON clubs FOR SELECT
  USING (
    id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- CLUB MEMBERSHIPS
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own memberships"
  ON club_memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Club admins read club memberships"
  ON club_memberships FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins manage club memberships"
  ON club_memberships FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
    OR
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- PLAYERS
DROP POLICY IF EXISTS "Everyone can read players" ON players;
DROP POLICY IF EXISTS "Everyone can select players" ON players;
DROP POLICY IF EXISTS "Admins can do anything" ON players;
DROP POLICY IF EXISTS "Admins can do anything with players" ON players;
DROP POLICY IF EXISTS "Scouts can update players" ON players;
DROP POLICY IF EXISTS "Scouts can insert players" ON players;
DROP POLICY IF EXISTS "Editors can insert players" ON players;
DROP POLICY IF EXISTS "Editors can update players" ON players;
DROP POLICY IF EXISTS "Admins can insert players" ON players;
DROP POLICY IF EXISTS "Admins can update players" ON players;
DROP POLICY IF EXISTS "Admins can delete players" ON players;

CREATE POLICY "Club members read players"
  ON players FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club members insert players"
  ON players FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

CREATE POLICY "Admin/editor update players"
  ON players FOR UPDATE
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

CREATE POLICY "Admin delete players"
  ON players FOR DELETE
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- AGE GROUPS
DROP POLICY IF EXISTS "Everyone can read age_groups" ON age_groups;
DROP POLICY IF EXISTS "Admins can manage age_groups" ON age_groups;

CREATE POLICY "Club members read age_groups"
  ON age_groups FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club admins manage age_groups"
  ON age_groups FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- SCOUTING REPORTS
DROP POLICY IF EXISTS "Everyone can read scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Everyone can select scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Admins can do anything with scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Admins insert scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Admins update scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Admins delete scouting_reports" ON scouting_reports;

CREATE POLICY "Club members read scouting_reports"
  ON scouting_reports FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club members insert scouting_reports"
  ON scouting_reports FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

CREATE POLICY "Admin/editor manage scouting_reports"
  ON scouting_reports FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

-- OBSERVATION NOTES
DROP POLICY IF EXISTS "Everyone can read observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Everyone can select observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Authenticated insert observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Admins can delete observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Authors can delete own observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Admins manage observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Admins update observation_notes" ON observation_notes;

CREATE POLICY "Club members read observation_notes"
  ON observation_notes FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club members insert observation_notes"
  ON observation_notes FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

CREATE POLICY "Admin manage observation_notes"
  ON observation_notes FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Authors delete own observation_notes"
  ON observation_notes FOR DELETE
  USING (author_id = auth.uid());

-- STATUS HISTORY
DROP POLICY IF EXISTS "Everyone can read status_history" ON status_history;
DROP POLICY IF EXISTS "Everyone can select status_history" ON status_history;
DROP POLICY IF EXISTS "Authenticated insert status_history" ON status_history;
DROP POLICY IF EXISTS "Admins can do anything with status_history" ON status_history;

CREATE POLICY "Club members read status_history"
  ON status_history FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club members insert status_history"
  ON status_history FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

-- CALENDAR EVENTS
DROP POLICY IF EXISTS "Everyone can read calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "Everyone can select calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "Authenticated insert calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "Admins can do anything with calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "Admins manage calendar_events" ON calendar_events;

CREATE POLICY "Club members read calendar_events"
  ON calendar_events FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club members manage calendar_events"
  ON calendar_events FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

-- SCOUT EVALUATIONS
DROP POLICY IF EXISTS "Everyone can read scout_evaluations" ON scout_evaluations;
DROP POLICY IF EXISTS "Everyone can select scout_evaluations" ON scout_evaluations;
DROP POLICY IF EXISTS "Authenticated users can upsert own evaluations" ON scout_evaluations;
DROP POLICY IF EXISTS "Users can delete own evaluations" ON scout_evaluations;
DROP POLICY IF EXISTS "Authenticated upsert scout_evaluations" ON scout_evaluations;

CREATE POLICY "Club members read scout_evaluations"
  ON scout_evaluations FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Club members upsert scout_evaluations"
  ON scout_evaluations FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users update own scout_evaluations"
  ON scout_evaluations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own scout_evaluations"
  ON scout_evaluations FOR DELETE
  USING (user_id = auth.uid());

-- SCOUT REPORTS (submissions)
DROP POLICY IF EXISTS "Scouts can insert own reports" ON scout_reports;
DROP POLICY IF EXISTS "Scouts can read own reports" ON scout_reports;
DROP POLICY IF EXISTS "Admins can do anything with scout_reports" ON scout_reports;
DROP POLICY IF EXISTS "Admins manage scout_reports" ON scout_reports;
DROP POLICY IF EXISTS "Admin/editor read all scout_reports" ON scout_reports;
DROP POLICY IF EXISTS "Admin/editor update scout_reports" ON scout_reports;

CREATE POLICY "Club members read scout_reports"
  ON scout_reports FOR SELECT
  USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
    OR author_id = auth.uid()
  );

CREATE POLICY "Club members insert scout_reports"
  ON scout_reports FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid()
    )
    AND author_id = auth.uid()
  );

CREATE POLICY "Admin/editor manage scout_reports"
  ON scout_reports FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

-- PROFILES — keep global read
-- (no changes needed, profiles remain globally readable)
