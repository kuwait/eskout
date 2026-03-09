-- supabase/migrations/045_block_status_history_delete.sql
-- Block DELETE on status_history — append-only audit log, nobody can delete entries
-- RELEVANT FILES: supabase/migrations/038_column_level_protection.sql, supabase/migrations/037_tighten_rls_policies.sql

-- Drop any old permissive policies that might allow delete
DROP POLICY IF EXISTS "system_insert_history" ON status_history;
DROP POLICY IF EXISTS "Admins can do anything with status_history" ON status_history;
DROP POLICY IF EXISTS "editor_write_history" ON status_history;

-- Block all deletes via RLS
CREATE POLICY "No deletes on status_history"
  ON status_history FOR DELETE
  USING (false);
