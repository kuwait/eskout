-- Migration 070: Migrate players.notes to observation_notes
-- Moves existing player notes into the observation_notes table
-- Uses referred_by_user_id as author when available (the person who wrote the original note in the Excel)
-- When no author is known, author_id is NULL (displays as "Veio do Excel Antigo" in the app)

INSERT INTO observation_notes (club_id, player_id, author_id, content, priority, created_at)
SELECT
  p.club_id,
  p.id,
  p.referred_by_user_id,  -- NULL if unknown, user ID if referrer is a system user
  CASE
    WHEN p.referred_by_user_id IS NULL THEN '[Veio do Excel Antigo] ' || p.notes
    ELSE p.notes
  END,
  'normal',
  p.created_at  -- preserve original timestamp
FROM players p
WHERE p.notes IS NOT NULL
  AND TRIM(p.notes) != ''
  -- Skip if an observation note with the exact same content already exists for this player
  AND NOT EXISTS (
    SELECT 1 FROM observation_notes o
    WHERE o.player_id = p.id
      AND o.content = p.notes
  );

-- Clear the notes field on migrated players
UPDATE players
SET notes = NULL
WHERE notes IS NOT NULL
  AND TRIM(notes) != '';
