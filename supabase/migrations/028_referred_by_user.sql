-- Migration 028: Add referred_by_user_id to link referrals to profiles
-- Keeps referred_by (text) as fallback for external referrals

ALTER TABLE players
  ADD COLUMN referred_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for querying "all players referred by scout X"
CREATE INDEX idx_players_referred_by_user ON players(referred_by_user_id)
  WHERE referred_by_user_id IS NOT NULL;

-- Backfill: match existing referred_by text to profile full_name (case-insensitive)
UPDATE players p
SET referred_by_user_id = pr.id
FROM profiles pr
WHERE LOWER(TRIM(p.referred_by)) = LOWER(TRIM(pr.full_name))
  AND p.referred_by IS NOT NULL
  AND p.referred_by_user_id IS NULL;
