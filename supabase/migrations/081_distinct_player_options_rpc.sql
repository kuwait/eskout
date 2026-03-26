-- Migration 081: RPC for distinct player dropdown options
-- Returns unique clubs, nationalities, and birth years for a given club
-- Replaces 3 separate queries fetching up to 5000 rows each

CREATE OR REPLACE FUNCTION distinct_player_options(p_club_id uuid)
RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'clubs', COALESCE((
      SELECT json_agg(c ORDER BY c)
      FROM (SELECT DISTINCT club AS c FROM players WHERE club_id = p_club_id AND club IS NOT NULL AND club != '') sub
    ), '[]'::json),
    'nationalities', COALESCE((
      SELECT json_agg(n ORDER BY n)
      FROM (SELECT DISTINCT nationality AS n FROM players WHERE club_id = p_club_id AND nationality IS NOT NULL AND nationality != '') sub
    ), '[]'::json),
    'birth_years', COALESCE((
      SELECT json_agg(y ORDER BY y DESC)
      FROM (SELECT DISTINCT EXTRACT(YEAR FROM dob)::int AS y FROM players WHERE club_id = p_club_id AND dob IS NOT NULL) sub
    ), '[]'::json)
  );
$$;
