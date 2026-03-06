-- supabase/migrations/015_migrate_notes_to_observation_notes.sql
-- Migrates players.notes (imported from Excel) into observation_notes table
-- These are legacy observations that were stored as a text field on the player
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/lib/types/index.ts

-- Copy non-empty notes from players into observation_notes
-- author_id is NULL because these were imported, not created by a specific user
-- match_context is NULL because the original data didn't have it
-- created_at uses the player's created_at as a best approximation
INSERT INTO observation_notes (player_id, author_id, content, match_context, created_at)
SELECT
  id,
  NULL,
  notes,
  NULL,
  created_at
FROM players
WHERE notes IS NOT NULL
  AND TRIM(notes) != '';

-- Clear the notes field on players after migration
UPDATE players
SET notes = NULL
WHERE notes IS NOT NULL
  AND TRIM(notes) != '';
