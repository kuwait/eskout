-- supabase/migrations/039_fix_profiles_rls.sql
-- Fix profiles RLS: superadmin policy had self-referencing subquery (potential recursion)
-- Replace with SECURITY DEFINER function to avoid recursion

-- Create a safe function to check superadmin status (bypasses RLS on profiles)
CREATE OR REPLACE FUNCTION public.is_superadmin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_superadmin FROM profiles WHERE id = uid),
    false
  );
$$;

-- Drop the problematic self-referencing policy
DROP POLICY IF EXISTS "Superadmins read all profiles" ON profiles;

-- Recreate using the safe function
CREATE POLICY "Superadmins read all profiles"
  ON profiles FOR SELECT
  USING (is_superadmin(auth.uid()));

-- Also ensure the old global read policy is definitely gone
-- (the policy name might differ between Supabase instances)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public'
      AND cmd = 'SELECT'
      AND policyname NOT IN (
        'Users read own profile',
        'Club members read peer profiles',
        'Superadmins read all profiles'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
    RAISE NOTICE 'Dropped old profiles SELECT policy: %', pol.policyname;
  END LOOP;
END;
$$;
