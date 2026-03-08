-- supabase/migrations/032_fix_club_memberships_rls.sql
-- Fix recursive RLS on club_memberships — the FOR ALL policy references itself
-- causing infinite recursion and returning 0 rows
-- Solution: use security definer function to check membership without RLS

-- Create a security definer function that bypasses RLS to check membership
CREATE OR REPLACE FUNCTION public.user_club_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM club_memberships WHERE user_id = uid;
$$;

-- Also create a role check function
CREATE OR REPLACE FUNCTION public.user_club_role(uid UUID, cid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM club_memberships WHERE user_id = uid AND club_id = cid LIMIT 1;
$$;

-- Drop old policies on club_memberships
DROP POLICY IF EXISTS "Users read own memberships" ON club_memberships;
DROP POLICY IF EXISTS "Club admins read club memberships" ON club_memberships;
DROP POLICY IF EXISTS "Admins manage club memberships" ON club_memberships;

-- Recreate without self-reference
CREATE POLICY "Users read own memberships"
  ON club_memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Club admins read club memberships"
  ON club_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
    )
    OR user_club_role(auth.uid(), club_id) = 'admin'
  );

CREATE POLICY "Superadmins manage club memberships"
  ON club_memberships FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

CREATE POLICY "Club admins insert memberships"
  ON club_memberships FOR INSERT
  WITH CHECK (
    user_club_role(auth.uid(), club_id) = 'admin'
  );

CREATE POLICY "Club admins update memberships"
  ON club_memberships FOR UPDATE
  USING (
    user_club_role(auth.uid(), club_id) = 'admin'
  );

CREATE POLICY "Club admins delete memberships"
  ON club_memberships FOR DELETE
  USING (
    user_club_role(auth.uid(), club_id) = 'admin'
  );

-- Now fix all other tables to use the security definer function
-- instead of subquerying club_memberships directly (which also hits RLS)

-- PLAYERS
DROP POLICY IF EXISTS "Club members read players" ON players;
DROP POLICY IF EXISTS "Club members insert players" ON players;
DROP POLICY IF EXISTS "Admin/editor update players" ON players;
DROP POLICY IF EXISTS "Admin delete players" ON players;

CREATE POLICY "Club members read players"
  ON players FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members insert players"
  ON players FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members update players"
  ON players FOR UPDATE
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Admin delete players"
  ON players FOR DELETE
  USING (user_club_role(auth.uid(), club_id) = 'admin');

-- AGE GROUPS
DROP POLICY IF EXISTS "Club members read age_groups" ON age_groups;
DROP POLICY IF EXISTS "Club admins manage age_groups" ON age_groups;

CREATE POLICY "Club members read age_groups"
  ON age_groups FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club admins manage age_groups"
  ON age_groups FOR ALL
  USING (user_club_role(auth.uid(), club_id) = 'admin');

-- CLUBS
DROP POLICY IF EXISTS "Members read own clubs" ON clubs;

CREATE POLICY "Members read own clubs"
  ON clubs FOR SELECT
  USING (id IN (SELECT user_club_ids(auth.uid())));

-- SCOUTING REPORTS
DROP POLICY IF EXISTS "Club members read scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Club members insert scouting_reports" ON scouting_reports;
DROP POLICY IF EXISTS "Admin/editor manage scouting_reports" ON scouting_reports;

CREATE POLICY "Club members read scouting_reports"
  ON scouting_reports FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members insert scouting_reports"
  ON scouting_reports FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Admin/editor manage scouting_reports"
  ON scouting_reports FOR ALL
  USING (user_club_role(auth.uid(), club_id) IN ('admin', 'editor'));

-- OBSERVATION NOTES
DROP POLICY IF EXISTS "Club members read observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Club members insert observation_notes" ON observation_notes;
DROP POLICY IF EXISTS "Admin manage observation_notes" ON observation_notes;

CREATE POLICY "Club members read observation_notes"
  ON observation_notes FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members insert observation_notes"
  ON observation_notes FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Admin manage observation_notes"
  ON observation_notes FOR ALL
  USING (user_club_role(auth.uid(), club_id) = 'admin');

-- STATUS HISTORY
DROP POLICY IF EXISTS "Club members read status_history" ON status_history;
DROP POLICY IF EXISTS "Club members insert status_history" ON status_history;

CREATE POLICY "Club members read status_history"
  ON status_history FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members insert status_history"
  ON status_history FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())));

-- CALENDAR EVENTS
DROP POLICY IF EXISTS "Club members read calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "Club members manage calendar_events" ON calendar_events;

CREATE POLICY "Club members read calendar_events"
  ON calendar_events FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members manage calendar_events"
  ON calendar_events FOR ALL
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

-- SCOUT EVALUATIONS
DROP POLICY IF EXISTS "Club members read scout_evaluations" ON scout_evaluations;
DROP POLICY IF EXISTS "Club members upsert scout_evaluations" ON scout_evaluations;

CREATE POLICY "Club members read scout_evaluations"
  ON scout_evaluations FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

CREATE POLICY "Club members upsert scout_evaluations"
  ON scout_evaluations FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())) AND user_id = auth.uid());

-- SCOUT REPORTS
DROP POLICY IF EXISTS "Club members read scout_reports" ON scout_reports;
DROP POLICY IF EXISTS "Club members insert scout_reports" ON scout_reports;
DROP POLICY IF EXISTS "Admin/editor manage scout_reports" ON scout_reports;

CREATE POLICY "Club members read scout_reports"
  ON scout_reports FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())) OR author_id = auth.uid());

CREATE POLICY "Club members insert scout_reports"
  ON scout_reports FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())) AND author_id = auth.uid());

CREATE POLICY "Admin/editor manage scout_reports"
  ON scout_reports FOR ALL
  USING (user_club_role(auth.uid(), club_id) IN ('admin', 'editor'));
