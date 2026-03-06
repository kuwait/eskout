-- supabase/migrations/017_notes_delete_policy.sql
-- Adds RLS policies for deleting and updating observation notes
-- Admins can delete any note, authors can delete their own notes
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/actions/notes.ts

-- Admins can do everything with notes
CREATE POLICY "admin_all_notes" ON observation_notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Authors can delete their own notes
CREATE POLICY "author_delete_own_notes" ON observation_notes FOR DELETE USING (
  auth.uid() = author_id
);

-- Authors can update their own notes
CREATE POLICY "author_update_own_notes" ON observation_notes FOR UPDATE USING (
  auth.uid() = author_id
);
