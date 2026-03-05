-- 013_position_normalized_dc_sub_slots.sql
-- Allow DC_E and DC_D as valid position_normalized values for real squad formation sub-slots

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_position_normalized_check;

ALTER TABLE players
  ADD CONSTRAINT players_position_normalized_check
  CHECK (position_normalized IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR position_normalized IS NULL);
