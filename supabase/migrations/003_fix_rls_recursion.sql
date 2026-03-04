-- supabase/migrations/003_fix_rls_recursion.sql
-- Fix infinite recursion in RLS policies caused by profiles table self-referencing
-- Uses a SECURITY DEFINER function to check admin role without triggering RLS on profiles
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/lib/supabase/queries.ts, src/lib/types/index.ts

-- Step 1: Create a security definer function to check admin role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Step 2: Drop the problematic policies
DROP POLICY IF EXISTS "admin_write_profiles" ON profiles;
DROP POLICY IF EXISTS "read_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_write_players" ON players;
DROP POLICY IF EXISTS "admin_write_reports" ON scouting_reports;
DROP POLICY IF EXISTS "admin_write_age_groups" ON age_groups;

-- Step 3: Recreate profiles policies without recursion
DROP POLICY IF EXISTS "read_all_profiles" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "insert_profile" ON profiles;
DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;

CREATE POLICY "read_all_profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "insert_profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL USING (public.is_admin());

-- Step 4: Recreate admin policies using the security definer function
CREATE POLICY "admin_write_players" ON players FOR ALL USING (public.is_admin());
CREATE POLICY "admin_write_reports" ON scouting_reports FOR ALL USING (public.is_admin());
CREATE POLICY "admin_write_age_groups" ON age_groups FOR ALL USING (public.is_admin());
