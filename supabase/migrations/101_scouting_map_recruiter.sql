-- Migration 101: Add recruiter to scouting map SELECT policies
-- Recruiters see what scouts see — published rounds, read-only

-- Drop and recreate SELECT policies to include recruiter

DROP POLICY IF EXISTS "scouting_rounds_select" ON scouting_rounds;
CREATE POLICY "scouting_rounds_select" ON scouting_rounds
  FOR SELECT USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout', 'recruiter')
  );

DROP POLICY IF EXISTS "scouting_games_select" ON scouting_games;
CREATE POLICY "scouting_games_select" ON scouting_games
  FOR SELECT USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout', 'recruiter')
  );

DROP POLICY IF EXISTS "scout_assignments_select" ON scout_assignments;
CREATE POLICY "scout_assignments_select" ON scout_assignments
  FOR SELECT USING (
    scout_id = auth.uid()
    OR user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'recruiter')
  );

DROP POLICY IF EXISTS "scout_avail_select" ON scout_availability;
CREATE POLICY "scout_avail_select" ON scout_availability
  FOR SELECT USING (
    scout_id = auth.uid()
    OR user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'recruiter')
  );
