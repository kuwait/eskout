-- Add decision_side column to players table
-- Distinguishes "club deciding" from "player deciding" within the a_decidir status
-- Values: 'club' (department hasn't decided) or 'player' (proposal made, player thinking)

ALTER TABLE players ADD COLUMN decision_side TEXT DEFAULT NULL
  CHECK (decision_side IN ('club', 'player'));

-- Backfill existing a_decidir players with 'club' as default
UPDATE players SET decision_side = 'club' WHERE recruitment_status = 'a_decidir';
