-- Migration 109: Add is_preseason flag to squad_players
-- Marks players that are doing pre-season with the main team but belong to another age group/club.
-- Mirrors the pattern used by is_doubt (079) and is_signed (098) — per-squad-per-player, independent of pipeline.
-- RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/actions/squads.ts

ALTER TABLE squad_players
  ADD COLUMN IF NOT EXISTS is_preseason BOOLEAN NOT NULL DEFAULT false;
