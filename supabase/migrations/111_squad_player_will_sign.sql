-- Migration 111: Add is_will_sign flag to squad_players
-- Intermediate state between "Por Assinar" and "Assinou" — player has decided to sign but not yet official.
-- Mutually exclusive with is_signed at the UI level (cycle: none → will_sign → signed → none).
-- Mirrors the pattern of is_doubt (079), is_signed (098) and is_preseason (109).
-- RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/actions/squads.ts

ALTER TABLE squad_players
  ADD COLUMN IF NOT EXISTS is_will_sign BOOLEAN NOT NULL DEFAULT false;
