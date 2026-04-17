-- Migration 110: Add doubt_reason fields to squad_players
-- Players in the "Dúvida" special section have a distinct reason (distinct from recruitment pipeline status)
-- describing WHY they are in doubt: Saúde, Pré-Época, Outro Escalão, A Dispensar, A Decidir, Outro (with custom text + color).
-- RELEVANT FILES: src/components/squad/SquadSpecialSection.tsx, src/lib/constants.ts, src/actions/squads.ts

ALTER TABLE squad_players
  ADD COLUMN IF NOT EXISTS doubt_reason TEXT,
  ADD COLUMN IF NOT EXISTS doubt_reason_custom TEXT,
  ADD COLUMN IF NOT EXISTS doubt_reason_color TEXT;

-- Constrain reason values — keep in sync with DOUBT_REASONS in src/lib/constants.ts
ALTER TABLE squad_players
  DROP CONSTRAINT IF EXISTS squad_players_doubt_reason_check;

ALTER TABLE squad_players
  ADD CONSTRAINT squad_players_doubt_reason_check
  CHECK (doubt_reason IS NULL OR doubt_reason IN ('decidir', 'saude', 'pre_epoca', 'outro_escalao', 'dispensar', 'outro'));

-- Constrain custom color palette — must match CUSTOM_COLOR_CHOICES keys in constants.ts
ALTER TABLE squad_players
  DROP CONSTRAINT IF EXISTS squad_players_doubt_reason_color_check;

ALTER TABLE squad_players
  ADD CONSTRAINT squad_players_doubt_reason_color_check
  CHECK (doubt_reason_color IS NULL OR doubt_reason_color IN ('red', 'orange', 'amber', 'green', 'blue', 'purple', 'pink', 'slate'));
