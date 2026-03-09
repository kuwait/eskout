-- supabase/migrations/040_revert_profiles_global_read.sql
-- Revert profiles SELECT to global read — the scoped policy from 037 broke club picker
-- Cross-club profile privacy deferred to Phase 6 (multi-tenant) when actually needed
-- For now, any authenticated user can read all profiles (needed for name lookups, AppShell, etc.)

DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Club members read peer profiles" ON profiles;
DROP POLICY IF EXISTS "Superadmins read all profiles" ON profiles;

CREATE POLICY "Authenticated read all profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
