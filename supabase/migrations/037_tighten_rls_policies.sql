-- supabase/migrations/037_tighten_rls_policies.sql
-- Tighten RLS policies: restrict UPDATE/DELETE by role, not just club membership
-- Fixes: players UPDATE open to all, calendar open to all, notes INSERT open to recruiters
-- Also scopes profiles to club members only (cross-club privacy)

-- ============================================================
-- 1. PLAYERS — restrict UPDATE to admin/editor, scout only own created
-- ============================================================

DROP POLICY IF EXISTS "Club members update players" ON players;

-- Admin and editor can update any player in their club
CREATE POLICY "Admin/editor update players"
  ON players FOR UPDATE
  USING (user_club_role(auth.uid(), club_id) IN ('admin', 'editor'));

-- Scouts can only update players they created (and only while pending approval)
CREATE POLICY "Scouts update own pending players"
  ON players FOR UPDATE
  USING (
    user_club_role(auth.uid(), club_id) = 'scout'
    AND created_by = auth.uid()
    AND pending_approval = true
  );

-- Recruiters can only update pipeline fields — enforced at app level,
-- but at RLS level they can only update players in their club
CREATE POLICY "Recruiters update players"
  ON players FOR UPDATE
  USING (user_club_role(auth.uid(), club_id) = 'recruiter');

-- ============================================================
-- 2. CALENDAR EVENTS — restrict to admin/editor only
-- ============================================================

DROP POLICY IF EXISTS "Club members manage calendar_events" ON calendar_events;

-- Anyone in the club can still READ events
-- (the "Club members read calendar_events" SELECT policy remains)

-- Only admin/editor can create/update/delete events
CREATE POLICY "Admin/editor manage calendar_events"
  ON calendar_events FOR INSERT
  WITH CHECK (user_club_role(auth.uid(), club_id) IN ('admin', 'editor'));

CREATE POLICY "Admin/editor update calendar_events"
  ON calendar_events FOR UPDATE
  USING (user_club_role(auth.uid(), club_id) IN ('admin', 'editor'));

CREATE POLICY "Admin/editor delete calendar_events"
  ON calendar_events FOR DELETE
  USING (user_club_role(auth.uid(), club_id) IN ('admin', 'editor'));

-- ============================================================
-- 3. OBSERVATION NOTES — restrict INSERT to admin/editor/scout (not recruiter)
-- ============================================================

DROP POLICY IF EXISTS "Club members insert observation_notes" ON observation_notes;

CREATE POLICY "Admin/editor/scout insert observation_notes"
  ON observation_notes FOR INSERT
  WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout')
    AND author_id = auth.uid()
  );

-- ============================================================
-- 4. PROFILES — scope reads to club members only (privacy across clubs)
-- ============================================================

-- Drop all existing profile SELECT policies
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Everyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;

-- Users can always read their own profile
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Users can read profiles of people in the same club(s)
CREATE POLICY "Club members read peer profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT cm.user_id
      FROM club_memberships cm
      WHERE cm.club_id IN (SELECT user_club_ids(auth.uid()))
    )
  );

-- Superadmins can read all profiles (for master panel)
CREATE POLICY "Superadmins read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  );

-- ============================================================
-- 5. STATUS HISTORY — restrict INSERT to admin/editor/scout (not recruiter)
-- ============================================================

DROP POLICY IF EXISTS "Club members insert status_history" ON status_history;

CREATE POLICY "Admin/editor/scout insert status_history"
  ON status_history FOR INSERT
  WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout')
  );

-- ============================================================
-- 6. SCOUT EVALUATIONS — ensure users can only insert/update their own
-- ============================================================

-- The existing UPDATE policy only checks user_id = auth.uid() but not club_id
DROP POLICY IF EXISTS "Users update own scout_evaluations" ON scout_evaluations;
DROP POLICY IF EXISTS "Users delete own scout_evaluations" ON scout_evaluations;

CREATE POLICY "Users update own scout_evaluations"
  ON scout_evaluations FOR UPDATE
  USING (
    user_id = auth.uid()
    AND club_id IN (SELECT user_club_ids(auth.uid()))
  );

CREATE POLICY "Users delete own scout_evaluations"
  ON scout_evaluations FOR DELETE
  USING (
    user_id = auth.uid()
    AND club_id IN (SELECT user_club_ids(auth.uid()))
  );
