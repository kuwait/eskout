-- Migration 084: Fix Security Advisor warnings
-- Sets search_path on all public functions to prevent search path injection
-- Tightens training_feedback RLS from USING(true) to club-scoped
-- No functional changes — only security hardening

/* ───────────── Function Search Path Mutable ───────────── */

ALTER FUNCTION can_view_fpf_competitions SET search_path = public;
ALTER FUNCTION is_fpf_superadmin SET search_path = public;
ALTER FUNCTION distinct_player_options(uuid) SET search_path = public;
ALTER FUNCTION get_playing_up_players SET search_path = public;
ALTER FUNCTION seed_contact_purposes SET search_path = public;
ALTER FUNCTION search_players_unaccent(uuid, text[], text, text, text, text, int[], int) SET search_path = public;
ALTER FUNCTION update_updated_at_column SET search_path = public;

/* ───────────── RLS Policy Always True — training_feedback ───────────── */

-- SELECT: was USING(true), now scoped to club members
DROP POLICY IF EXISTS "Members read training feedback" ON training_feedback;
CREATE POLICY "Members read training feedback"
  ON training_feedback FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE club_memberships.club_id = training_feedback.club_id
        AND club_memberships.user_id = auth.uid()
    )
  );

-- INSERT: was WITH CHECK(true), now scoped to club members
DROP POLICY IF EXISTS "Staff insert training feedback" ON training_feedback;
CREATE POLICY "Staff insert training feedback"
  ON training_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE club_memberships.club_id = training_feedback.club_id
        AND club_memberships.user_id = auth.uid()
    )
  );

-- DELETE: was USING(true), now scoped to club admins
DROP POLICY IF EXISTS "Admin delete training feedback" ON training_feedback;
CREATE POLICY "Admin delete training feedback"
  ON training_feedback FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE club_memberships.club_id = training_feedback.club_id
        AND club_memberships.user_id = auth.uid()
        AND club_memberships.role = 'admin'
    )
  );
