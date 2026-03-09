-- supabase/migrations/035_recruiter_role.sql
-- Add 'recruiter' role for club staff who handle negotiations/signing
-- Recruiters can read players but not see scouting intelligence (ratings, reports, notes)
-- RELEVANT FILES: supabase/migrations/022_editor_role.sql, supabase/migrations/029_clubs_and_memberships.sql, src/lib/types/index.ts

-- Step 1: Update the role CHECK constraint on profiles to include 'recruiter'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'editor', 'scout', 'recruiter'));

-- Step 2: Update the role CHECK constraint on club_memberships
ALTER TABLE club_memberships DROP CONSTRAINT IF EXISTS club_memberships_role_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_role_check CHECK (role IN ('admin', 'editor', 'scout', 'recruiter'));

-- Step 3: Update helper functions to include recruiter where appropriate
-- is_scout_or_admin — any authenticated role (used for read policies)
CREATE OR REPLACE FUNCTION public.is_scout_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor', 'scout', 'recruiter')
  );
$$;

-- Recruiter can update pipeline-related fields on players (recruitment_status, dates, notes)
-- but NOT scouting fields (department_opinion, observer_*, is_shadow_squad, etc.)
-- This is enforced at the application level, not RLS (RLS controls row access, not column access)
