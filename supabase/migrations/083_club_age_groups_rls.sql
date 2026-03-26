-- Migration 083: Enable RLS on club_age_groups (flagged by Supabase Security Advisor)
-- This table was created in migration 029 but RLS was never enabled

ALTER TABLE club_age_groups ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read age groups (needed for age group selector)
CREATE POLICY "Authenticated users can read club_age_groups"
  ON club_age_groups FOR SELECT
  TO authenticated
  USING (true);

-- Only admins of the club can insert/update/delete age groups
CREATE POLICY "Admins can manage club_age_groups"
  ON club_age_groups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE club_memberships.club_id = club_age_groups.club_id
        AND club_memberships.user_id = auth.uid()
        AND club_memberships.role = 'admin'
    )
  );
