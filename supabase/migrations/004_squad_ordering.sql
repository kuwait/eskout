-- supabase/migrations/004_squad_ordering.sql
-- Adds ordering columns for drag-and-drop reordering in squad formations
-- Allows scouts to set priority order within each position slot
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/lib/types/index.ts, src/lib/supabase/mappers.ts

ALTER TABLE players ADD COLUMN shadow_order INT DEFAULT 0;
ALTER TABLE players ADD COLUMN real_order INT DEFAULT 0;

COMMENT ON COLUMN players.shadow_order IS 'Display order within position in shadow squad (lower = higher priority)';
COMMENT ON COLUMN players.real_order IS 'Display order within position in real squad (lower = higher priority)';
