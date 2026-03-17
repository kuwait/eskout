-- Migration 073: Fix shared lists RLS — allow shared users to read shared lists
-- Without this, PostgREST joins from player_list_shares to player_lists return null
-- because player_lists RLS only allows owner or admin reads.
-- Note: player_list_shares RLS does NOT reference player_lists, so no recursion risk.

CREATE POLICY "Shared users see shared lists"
  ON player_lists FOR SELECT
  USING (id IN (SELECT list_id FROM player_list_shares WHERE user_id = auth.uid()));
