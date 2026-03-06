-- supabase/migrations/022_editor_role.sql
-- Add 'editor' role to the profiles table and update RLS helper functions
-- Editors can do everything except delete players and manage users
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, supabase/migrations/003_fix_rls_recursion.sql, src/lib/types/index.ts

-- Step 1: Update the role CHECK constraint to include 'editor'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'editor', 'scout'));

-- Step 2: Create helper function for admin or editor (for write operations)
CREATE OR REPLACE FUNCTION public.is_admin_or_editor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')
  );
$$;

-- Step 3: Update is_scout_or_admin to include editor
CREATE OR REPLACE FUNCTION public.is_scout_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor', 'scout')
  );
$$;

-- Step 4: Allow editors to write players (update existing policy to use admin_or_editor)
-- Keep the admin-only ALL policy for delete operations
-- Add separate INSERT/UPDATE policy for editors
DROP POLICY IF EXISTS "editor_write_players" ON players;
CREATE POLICY "editor_write_players" ON players
  FOR UPDATE USING (public.is_admin_or_editor());

DROP POLICY IF EXISTS "editor_insert_players" ON players;
CREATE POLICY "editor_insert_players" ON players
  FOR INSERT WITH CHECK (public.is_admin_or_editor());

-- Step 5: Allow editors to write scouting reports
DROP POLICY IF EXISTS "editor_write_reports" ON scouting_reports;
CREATE POLICY "editor_write_reports" ON scouting_reports
  FOR ALL USING (public.is_admin_or_editor());

-- Step 6: Allow editors to write observation notes (same as admin)
DROP POLICY IF EXISTS "editor_all_notes" ON observation_notes;
CREATE POLICY "editor_all_notes" ON observation_notes
  FOR ALL USING (public.is_admin_or_editor());

-- Step 7: Allow editors to manage calendar events
DROP POLICY IF EXISTS "editor_write_calendar" ON calendar_events;
CREATE POLICY "editor_write_calendar" ON calendar_events
  FOR ALL USING (public.is_admin_or_editor());

-- Step 8: Allow editors to manage status history
DROP POLICY IF EXISTS "editor_write_history" ON status_history;
CREATE POLICY "editor_write_history" ON status_history
  FOR INSERT WITH CHECK (public.is_admin_or_editor());
