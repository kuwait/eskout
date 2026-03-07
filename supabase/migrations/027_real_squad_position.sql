-- 027_real_squad_position.sql
-- Add dedicated real_squad_position column (like shadow_position) so position_normalized
-- stays as the player's natural position and is not overwritten by squad slot assignments.

ALTER TABLE players ADD COLUMN real_squad_position TEXT
  CHECK (real_squad_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR real_squad_position IS NULL);

COMMENT ON COLUMN players.real_squad_position IS 'Position slot in real squad formation (e.g. DC_E, DC_D). Separate from position_normalized which is the player''s natural position.';

-- Migrate existing data: players in real squad with DC_E/DC_D in position_normalized
-- move that value to real_squad_position and restore position_normalized to DC
UPDATE players
SET real_squad_position = position_normalized,
    position_normalized = 'DC'
WHERE is_real_squad = TRUE
  AND position_normalized IN ('DC_E', 'DC_D');

-- Players in real squad with a normal position: copy position_normalized to real_squad_position
UPDATE players
SET real_squad_position = position_normalized
WHERE is_real_squad = TRUE
  AND position_normalized IS NOT NULL
  AND real_squad_position IS NULL;

-- Revert position_normalized constraint to disallow DC_E/DC_D (they belong in squad position fields only)
ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_position_normalized_check;

ALTER TABLE players
  ADD CONSTRAINT players_position_normalized_check
  CHECK (position_normalized IN ('GR','DD','DE','DC','MDC','MD','MC','ME','MOC','ED','EE','AD','AE','SA','PL') OR position_normalized IS NULL);
