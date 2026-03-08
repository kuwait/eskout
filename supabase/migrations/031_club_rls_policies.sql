-- supabase/migrations/031_club_rls_policies.sql
-- Club-scoped RLS policies for multi-tenant isolation
-- Phase 6A: replaces old global policies with club-filtered ones

-- ============================================================
-- CLUBS — only superadmins can manage
-- ============================================================
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage clubs"
  ON clubs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true));

-- Members can read their own clubs (for club picker / sidebar)
CREATE POLICY "Members read own clubs"
  ON clubs FOR SELECT
  USING (
    id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- ============================================================
-- CLUB MEMBERSHIPS — superadmins + club admins
-- ============================================================
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships
CREATE POLICY "Users read own memberships"
  ON club_memberships FOR SELECT
  USING (user_id = auth.uid());

-- Club admins can read all memberships in their clubs
CREATE POLICY "Club admins read club memberships"
  ON club_memberships FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Superadmins + club admins can manage memberships
CREATE POLICY "Admins manage club memberships"
  ON club_memberships FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
    OR
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- PLAYERS — club-scoped
-- ============================================================

-- Drop old policies first (they use global access)
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

-- ============================================================
-- AGE GROUPS — club-scoped
-- ============================================================

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

-- ============================================================
-- SCOUTING REPORTS — club-scoped
-- ============================================================

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

-- ============================================================
-- OBSERVATION NOTES — club-scoped
-- ============================================================

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

-- ============================================================
-- STATUS HISTORY — club-scoped
-- ============================================================

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

-- ============================================================
-- CALENDAR EVENTS — club-scoped
-- ============================================================

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

-- ============================================================
-- SCOUT EVALUATIONS — club-scoped
-- ============================================================

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

-- ============================================================
-- SCOUT REPORTS (submissions) — club-scoped
-- ============================================================

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

-- ============================================================
-- PROFILES — keep global read (for name lookups across clubs)
-- ============================================================

-- Profiles remain globally readable; the role column stays for backward compat
-- but club_memberships.role is the source of truth for club-scoped permissions
