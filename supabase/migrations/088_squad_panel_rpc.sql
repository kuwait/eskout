-- Migration 088: Squad panel RPC
-- Returns squads + squad_players + player details in a single round-trip
-- Replaces 3 sequential client-side fetches (squads → squad_players → players)

CREATE OR REPLACE FUNCTION get_squad_panel(
  p_club_id uuid,
  p_squad_type text,
  p_age_group_id int DEFAULT NULL,
  p_squad_id int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_squads json;
  v_squad_players json;
  v_players json;
  v_shadow_age_group_ids json;
BEGIN
  -- 1. Squads: filtered by type + optional age group or direct ID
  IF p_squad_id IS NOT NULL THEN
    -- Direct squad link
    SELECT COALESCE(json_agg(s.*), '[]'::json) INTO v_squads
    FROM squads s
    WHERE s.club_id = p_club_id AND s.id = p_squad_id;
  ELSIF p_squad_type = 'shadow' AND p_age_group_id IS NOT NULL THEN
    -- Shadow: filter by age group
    SELECT COALESCE(json_agg(s.* ORDER BY s.sort_order, s.name), '[]'::json) INTO v_squads
    FROM squads s
    WHERE s.club_id = p_club_id AND s.squad_type = 'shadow' AND s.age_group_id = p_age_group_id;
  ELSIF p_squad_type = 'real' THEN
    -- Real: all real squads
    SELECT COALESCE(json_agg(s.* ORDER BY s.sort_order, s.name), '[]'::json) INTO v_squads
    FROM squads s
    WHERE s.club_id = p_club_id AND s.squad_type = 'real';
  ELSE
    v_squads := '[]'::json;
  END IF;

  -- 2. Squad players for all returned squads
  SELECT COALESCE(json_agg(sp.*), '[]'::json) INTO v_squad_players
  FROM squad_players sp
  WHERE sp.club_id = p_club_id
    AND sp.squad_id IN (SELECT (j->>'id')::int FROM json_array_elements(v_squads) j);

  -- 3. Player details for all squad members
  SELECT COALESCE(json_agg(p.* ORDER BY p.name), '[]'::json) INTO v_players
  FROM players p
  WHERE p.id IN (
    SELECT (j->>'player_id')::int FROM json_array_elements(v_squad_players) j
  );

  -- 4. Shadow age group IDs (which age groups have shadow squads)
  SELECT COALESCE(json_agg(DISTINCT s.age_group_id), '[]'::json) INTO v_shadow_age_group_ids
  FROM squads s
  WHERE s.club_id = p_club_id AND s.squad_type = 'shadow' AND s.age_group_id IS NOT NULL;

  RETURN json_build_object(
    'squads', v_squads,
    'squad_players', v_squad_players,
    'players', v_players,
    'shadow_age_group_ids', v_shadow_age_group_ids
  );
END;
$$;
