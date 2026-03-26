-- Migration 098: Add is_signed flag to squad_players
-- Like is_doubt but for marking players who signed/renewed — independent of pipeline
-- RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx

ALTER TABLE squad_players
  ADD COLUMN IF NOT EXISTS is_signed BOOLEAN NOT NULL DEFAULT false;
