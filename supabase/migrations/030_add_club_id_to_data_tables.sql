-- supabase/migrations/030_add_club_id_to_data_tables.sql
-- Adds club_id FK to all data tables + is_superadmin flag on profiles
-- Phase 6A: row-level tenant isolation column

-- Add is_superadmin to profiles (global, not per-club)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;

-- Add club_id to players
ALTER TABLE players ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_players_club ON players (club_id);

-- Add club_id to age_groups (existing global table becomes club-scoped)
ALTER TABLE age_groups ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_age_groups_club ON age_groups (club_id);

-- Add club_id to scouting_reports
ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scouting_reports_club ON scouting_reports (club_id);

-- Add club_id to observation_notes
ALTER TABLE observation_notes ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_observation_notes_club ON observation_notes (club_id);

-- Add club_id to status_history
ALTER TABLE status_history ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_status_history_club ON status_history (club_id);

-- Add club_id to calendar_events
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_club ON calendar_events (club_id);

-- Add club_id to scout_evaluations
ALTER TABLE scout_evaluations ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scout_evaluations_club ON scout_evaluations (club_id);

-- Add club_id to scout_reports
ALTER TABLE scout_reports ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scout_reports_club ON scout_reports (club_id);
