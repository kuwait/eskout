-- Migration 071: Decision date for "A Decidir" pipeline status
-- Date by which the player or club should give an answer
-- Cleared automatically when leaving a_decidir status

ALTER TABLE players ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ;
