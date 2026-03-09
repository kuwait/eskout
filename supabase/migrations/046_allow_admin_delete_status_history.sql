-- supabase/migrations/046_allow_admin_delete_status_history.sql
-- Allow club admins to delete status_history entries (cleanup test data)
-- RELEVANT FILES: src/actions/players.ts, supabase/migrations/045_block_status_history_delete.sql

-- Revert migration 045
DROP POLICY IF EXISTS "No deletes on status_history" ON status_history;

-- Allow admin to delete history entries in their club
CREATE POLICY "Admin delete status_history"
  ON status_history FOR DELETE
  USING (
    user_club_role(auth.uid(), club_id) = 'admin'
  );
