-- Add seen_at timestamp to player_list_items
-- Allows users to mark players as "observed/seen" within a list
ALTER TABLE player_list_items ADD COLUMN seen_at timestamptz DEFAULT NULL;
