-- supabase/migrations/016_multi_positions.sql
-- Adds secondary and tertiary position columns to players
-- Allows tracking multiple positions per player with priority levels
-- RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/mappers.ts, src/components/players/PlayerProfile.tsx

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS secondary_position TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tertiary_position TEXT DEFAULT NULL;

COMMENT ON COLUMN players.secondary_position IS 'Secondary position — good alternative (yellow on pitch)';
COMMENT ON COLUMN players.tertiary_position IS 'Tertiary position — can play in specific situations (orange on pitch)';
