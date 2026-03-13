-- supabase/migrations/064_drop_global_read_policies.sql
-- Drop legacy global SELECT policies from migration 001 that bypass club isolation
-- These were superseded by club-scoped policies in migration 032 but never removed
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, supabase/migrations/032_fix_club_memberships_rls.sql

-- Players: "Club members read players" (032) replaces this
DROP POLICY IF EXISTS "read_all_players" ON players;

-- Scouting reports: "Club members read scouting_reports" (032) replaces this
DROP POLICY IF EXISTS "read_all_reports" ON scouting_reports;

-- Status history: "Club members read status_history" (032) replaces this
DROP POLICY IF EXISTS "read_all_history" ON status_history;

-- Observation notes: "Club members read observation_notes" (032) replaces this
DROP POLICY IF EXISTS "read_all_notes" ON observation_notes;

-- Age groups: "Club members read age_groups" (032) replaces this
DROP POLICY IF EXISTS "read_all_age_groups" ON age_groups;
