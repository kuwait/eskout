-- Migration 089: Players page initial data RPC
-- Returns first page of players (50) with enrichment (ratings + note previews)
-- + dropdown options (distinct clubs, nationalities, birth years) in one round-trip

CREATE OR REPLACE FUNCTION get_players_page(
  p_club_id uuid,
  p_page_size int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players json;
  v_total_count int;
  v_options json;
BEGIN
  -- 1. Total count of non-pending players
  SELECT count(*) INTO v_total_count
  FROM players
  WHERE club_id = p_club_id AND pending_approval = false;

  -- 2. First page of players (sorted by name, limited to page size)
  -- Includes enrichment: avg rating from scouting_reports + scout_evaluations, note previews
  SELECT COALESCE(json_agg(sub ORDER BY sub.name), '[]'::json) INTO v_players
  FROM (
    SELECT p.*,
      -- Aggregated rating from reports + evaluations
      (
        SELECT round(avg(r.rating)::numeric, 1)
        FROM (
          SELECT sr.rating FROM scouting_reports sr WHERE sr.player_id = p.id AND sr.rating IS NOT NULL
          UNION ALL
          SELECT se.rating FROM scout_evaluations se WHERE se.player_id = p.id
        ) r
      ) AS avg_rating,
      (
        SELECT count(*)::int
        FROM (
          SELECT sr.id FROM scouting_reports sr WHERE sr.player_id = p.id AND sr.rating IS NOT NULL
          UNION ALL
          SELECT se.id FROM scout_evaluations se WHERE se.player_id = p.id
        ) r
      ) AS rating_count,
      -- First 3 note previews (most recent)
      COALESCE((
        SELECT json_agg(n.content ORDER BY n.created_at DESC)
        FROM (
          SELECT content, created_at FROM observation_notes
          WHERE player_id = p.id
          ORDER BY created_at DESC LIMIT 3
        ) n
      ), '[]'::json) AS note_previews
    FROM players p
    WHERE p.club_id = p_club_id AND p.pending_approval = false
    ORDER BY p.name
    LIMIT p_page_size
  ) sub;

  -- 3. Dropdown options (reuse distinct_player_options logic)
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
  ) INTO v_options;

  RETURN json_build_object(
    'players', v_players,
    'total_count', v_total_count,
    'options', v_options
  );
END;
$$;
