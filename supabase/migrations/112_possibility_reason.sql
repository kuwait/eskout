-- Migration 112: Possibility reason + expanded color palette
-- Adds possibility_reason_custom / possibility_reason_color columns for the "Possibilidades"
-- special section (real squads only) — ad-hoc motivo + cor per card, no presets.
-- Also expands the custom color palette (used by Dúvida 'outro' + Possibilidade) from 8 to 16.
-- RELEVANT FILES: src/components/squad/SquadSpecialSection.tsx, src/lib/constants.ts, src/actions/squads.ts

ALTER TABLE squad_players
  ADD COLUMN IF NOT EXISTS possibility_reason_custom TEXT,
  ADD COLUMN IF NOT EXISTS possibility_reason_color TEXT;

-- Expand the color palette for both Dúvida (doubt_reason_color) and new Possibilidade (possibility_reason_color).
-- Added: yellow, lime, emerald, teal, cyan, sky, indigo, rose.
ALTER TABLE squad_players
  DROP CONSTRAINT IF EXISTS squad_players_doubt_reason_color_check;

ALTER TABLE squad_players
  ADD CONSTRAINT squad_players_doubt_reason_color_check
  CHECK (doubt_reason_color IS NULL OR doubt_reason_color IN (
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
    'cyan', 'sky', 'blue', 'indigo', 'purple', 'pink', 'rose', 'slate'
  ));

ALTER TABLE squad_players
  ADD CONSTRAINT squad_players_possibility_reason_color_check
  CHECK (possibility_reason_color IS NULL OR possibility_reason_color IN (
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
    'cyan', 'sky', 'blue', 'indigo', 'purple', 'pink', 'rose', 'slate'
  ));
