-- Migration 073: Revert shared lists RLS policy — causes infinite recursion
-- The player_lists → player_list_shares subquery triggers Postgres infinite recursion detection.
-- Shared list access is handled in application code using the service client instead.

DROP POLICY IF EXISTS "Shared users see shared lists" ON player_lists;
