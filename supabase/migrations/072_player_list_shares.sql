-- Migration 072: Shared player lists
-- Allows list owners to share their lists with other club members
-- Shared users can view and edit list items but not rename/delete the list
-- NOTE: Access to shared lists is checked in application code (page.tsx), not RLS on player_lists
-- (RLS subquery on player_lists → player_list_shares causes infinite recursion)

CREATE TABLE player_list_shares (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES player_lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_list_shares_unique ON player_list_shares(list_id, user_id);
CREATE INDEX idx_list_shares_user ON player_list_shares(user_id);

/* ───────────── RLS on player_list_shares ───────────── */

ALTER TABLE player_list_shares ENABLE ROW LEVEL SECURITY;

-- List owner and shared user can see shares
CREATE POLICY "list_shares_select" ON player_list_shares
  FOR SELECT USING (
    user_id = auth.uid()
    OR shared_by = auth.uid()
  );

-- Only list owner can share (insert) — verified in application code
CREATE POLICY "list_shares_insert" ON player_list_shares
  FOR INSERT WITH CHECK (
    shared_by = auth.uid()
  );

-- List owner can revoke, shared user can leave
CREATE POLICY "list_shares_delete" ON player_list_shares
  FOR DELETE USING (
    user_id = auth.uid()
    OR shared_by = auth.uid()
  );

/* ───────────── Extend player_list_items RLS for shared users ───────────── */

-- Shared users can read items in lists shared with them
CREATE POLICY "shared_users_read_list_items" ON player_list_items
  FOR SELECT USING (
    list_id IN (SELECT list_id FROM player_list_shares WHERE user_id = auth.uid())
  );

-- Shared users can add items to lists shared with them
CREATE POLICY "shared_users_insert_list_items" ON player_list_items
  FOR INSERT WITH CHECK (
    list_id IN (SELECT list_id FROM player_list_shares WHERE user_id = auth.uid())
  );

-- Shared users can update items in lists shared with them
CREATE POLICY "shared_users_update_list_items" ON player_list_items
  FOR UPDATE USING (
    list_id IN (SELECT list_id FROM player_list_shares WHERE user_id = auth.uid())
  );

-- Shared users can delete items from lists shared with them
CREATE POLICY "shared_users_delete_list_items" ON player_list_items
  FOR DELETE USING (
    list_id IN (SELECT list_id FROM player_list_shares WHERE user_id = auth.uid())
  );
