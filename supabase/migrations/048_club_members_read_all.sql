-- supabase/migrations/048_club_members_read_all.sql
-- Allow all club members to read other members in their club
-- Previously only admins could see all memberships; non-admins only saw their own row
-- This broke the contact assignment dropdown (showed empty list for editors/scouts/recruiters)

CREATE POLICY "Club members read fellow memberships"
  ON club_memberships FOR SELECT
  USING (
    club_id IN (SELECT user_club_ids(auth.uid()))
  );
