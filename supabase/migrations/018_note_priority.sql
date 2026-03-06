-- supabase/migrations/018_note_priority.sql
-- Adds priority field to observation notes for flagging important/urgent notes
-- Enables future "urgent notes" dashboard across all players
-- RELEVANT FILES: src/lib/types/index.ts, src/actions/notes.ts, src/components/players/ObservationNotes.tsx

ALTER TABLE observation_notes
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

COMMENT ON COLUMN observation_notes.priority IS 'Note priority: normal, importante, urgente';
