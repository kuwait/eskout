-- 012_dc_sub_slots.sql
-- Allow DC_E and DC_D as valid shadow_position values for formation sub-slots
-- Also update position_normalized to support DC sub-slots for real squad

-- Drop the old CHECK constraint and replace with one that includes DC_E / DC_D
ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_shadow_position_check;

ALTER TABLE players
  ADD CONSTRAINT players_shadow_position_check
  CHECK (shadow_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR shadow_position IS NULL);
