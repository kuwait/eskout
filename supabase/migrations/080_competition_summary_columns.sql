-- 080: Add denormalized summary counters to fpf_competitions
-- Avoids expensive multi-table queries on page load — updated after each scrape/link
ALTER TABLE fpf_competitions
  ADD COLUMN IF NOT EXISTS total_series   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_teams    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_players  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_players INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlinked_players INTEGER NOT NULL DEFAULT 0;
