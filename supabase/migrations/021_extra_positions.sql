-- 021_extra_positions.sql
-- Add MD, ME, AD, AE, SA as valid position_normalized values
-- These positions are used for player profiles and MiniPitch but NOT for squad slots

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_position_normalized_check;

ALTER TABLE players
  ADD CONSTRAINT players_position_normalized_check
  CHECK (position_normalized IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MD','MC','ME','MOC','ED','EE','AD','AE','SA','PL') OR position_normalized IS NULL);

-- Also allow in secondary_position and tertiary_position if they have constraints
ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_secondary_position_check;

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_tertiary_position_check;

ALTER TABLE players
  ADD CONSTRAINT players_secondary_position_check
  CHECK (secondary_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MD','MC','ME','MOC','ED','EE','AD','AE','SA','PL') OR secondary_position IS NULL);

ALTER TABLE players
  ADD CONSTRAINT players_tertiary_position_check
  CHECK (tertiary_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MD','MC','ME','MOC','ED','EE','AD','AE','SA','PL') OR tertiary_position IS NULL);
