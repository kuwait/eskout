-- supabase/migrations/023_soft_delete_users.sql
-- Add soft delete to profiles — deactivated users keep their name for join references
-- Instead of deleting profiles, we set active = false and disable their auth account
-- RELEVANT FILES: supabase/migrations/022_editor_role.sql, src/actions/users.ts, src/lib/types/index.ts

-- Add active column (defaults to true for all existing users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
