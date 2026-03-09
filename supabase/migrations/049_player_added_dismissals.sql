-- supabase/migrations/049_player_added_dismissals.sql
-- Per-user dismiss system for "Jogadores Adicionados" notifications
-- Replaces the global admin_reviewed flag with per-user tracking
-- Each admin/editor can dismiss players from their own notification list independently

-- 1. Per-user dismissal tracking table
CREATE TABLE IF NOT EXISTS player_added_dismissals (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, player_id)
);

CREATE INDEX idx_player_dismissals_user ON player_added_dismissals (user_id);

-- 2. Track who approved scout-created players
ALTER TABLE players ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. RLS policies
ALTER TABLE player_added_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own dismissals
CREATE POLICY "Users manage own dismissals"
  ON player_added_dismissals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Note: admin_reviewed and pending_approval columns remain for backward compat
-- admin_reviewed is now deprecated — replaced by per-user dismissals
-- pending_approval still used for scout-created players requiring global approval
