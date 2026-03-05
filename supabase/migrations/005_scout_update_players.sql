-- supabase/migrations/005_scout_update_players.sql
-- Allow scouts to UPDATE players (needed for adding to squads, pipeline, etc.)
-- Previously only admins could update — scouts could only INSERT
-- RELEVANT FILES: supabase/migrations/003_fix_rls_recursion.sql, src/actions/squads.ts, src/actions/pipeline.ts

-- Helper: check if current user is scout or admin
CREATE OR REPLACE FUNCTION public.is_scout_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'scout')
  );
$$;

-- Allow scouts to update players (squad assignments, pipeline status, etc.)
CREATE POLICY "scout_update_players" ON players FOR UPDATE USING (
  public.is_scout_or_admin()
);
