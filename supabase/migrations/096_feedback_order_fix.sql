-- Migration 096: Fix training feedback ordering in get_player_profile RPC
-- ONLY change vs 086: line "ORDER BY sub.training_date DESC" → "ORDER BY sub.training_date DESC, sub.created_at DESC"
-- Everything else is an exact copy of migration 086

DROP FUNCTION IF EXISTS get_player_profile(int, uuid);

CREATE OR REPLACE FUNCTION get_player_profile(
  p_player_id int,
  p_club_id uuid
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player json;
  v_notes json;
  v_history json;
  v_reports json;
  v_evaluations json;
  v_quick_reports json;
  v_feedback json;
  v_videos json;
  v_squads json;
  v_age_group_name text;
  v_contact_name text;
  v_club_members json;
BEGIN
  -- 1. Player row (full)
  SELECT row_to_json(p.*) INTO v_player
  FROM players p
  WHERE p.id = p_player_id AND p.club_id = p_club_id;

  IF v_player IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Observation notes with author names pre-joined
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_notes
  FROM (
    SELECT n.*, COALESCE(pr.full_name, 'Importado') AS author_name
    FROM observation_notes n
    LEFT JOIN profiles pr ON pr.id = n.author_id
    WHERE n.player_id = p_player_id AND n.club_id = p_club_id
  ) sub;

  -- 3. Status history with author names + contact purpose labels
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_history
  FROM (
    SELECT sh.*, COALESCE(pr.full_name, 'Sistema') AS changed_by_name,
           cp.label AS contact_purpose_label
    FROM status_history sh
    LEFT JOIN profiles pr ON pr.id = sh.changed_by
    LEFT JOIN contact_purposes cp ON cp.id = sh.contact_purpose_id
    WHERE sh.player_id = p_player_id AND sh.club_id = p_club_id
  ) sub;

  -- 4. Scouting reports (raw rows)
  SELECT COALESCE(json_agg(sr ORDER BY sr.report_number ASC), '[]'::json) INTO v_reports
  FROM scouting_reports sr
  WHERE sr.player_id = p_player_id AND sr.club_id = p_club_id;

  -- 5. Scout evaluations with author names
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at ASC), '[]'::json) INTO v_evaluations
  FROM (
    SELECT se.id, se.player_id, se.user_id, se.rating, se.created_at, se.updated_at,
           COALESCE(pr.full_name, 'Scout') AS user_name
    FROM scout_evaluations se
    LEFT JOIN profiles pr ON pr.id = se.user_id
    WHERE se.player_id = p_player_id
  ) sub;

  -- 6. Quick scout reports with author names
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_quick_reports
  FROM (
    SELECT qsr.*, COALESCE(pr.full_name, 'Scout') AS author_name
    FROM quick_scout_reports qsr
    LEFT JOIN profiles pr ON pr.id = qsr.author_id
    WHERE qsr.player_id = p_player_id AND qsr.club_id = p_club_id
  ) sub;

  -- 7. Training feedback with author names — FIXED: added created_at DESC as tiebreaker
  SELECT COALESCE(json_agg(sub ORDER BY sub.training_date DESC, sub.created_at DESC), '[]'::json) INTO v_feedback
  FROM (
    SELECT tf.*, COALESCE(pr.full_name, 'Desconhecido') AS author_name
    FROM training_feedback tf
    LEFT JOIN profiles pr ON pr.id = tf.author_id
    WHERE tf.player_id = p_player_id AND tf.club_id = p_club_id
  ) sub;

  -- 8. Player videos
  SELECT COALESCE(json_agg(pv ORDER BY pv.created_at DESC), '[]'::json) INTO v_videos
  FROM player_videos pv
  WHERE pv.player_id = p_player_id AND pv.club_id = p_club_id;

  -- 9. Squad memberships with squad details + age group name
  SELECT COALESCE(json_agg(sub), '[]'::json) INTO v_squads
  FROM (
    SELECT sp.*, row_to_json(s.*) AS squad_data, ag.name AS age_group_name
    FROM squad_players sp
    JOIN squads s ON s.id = sp.squad_id
    LEFT JOIN age_groups ag ON ag.id = s.age_group_id
    WHERE sp.player_id = p_player_id AND s.club_id = p_club_id
  ) sub;

  -- 10. Age group name
  SELECT ag.name INTO v_age_group_name
  FROM age_groups ag
  WHERE ag.id = (v_player->>'age_group_id')::int;

  -- 11. Contact assigned profile name
  IF (v_player->>'contact_assigned_to') IS NOT NULL THEN
    SELECT pr.full_name INTO v_contact_name
    FROM profiles pr
    WHERE pr.id = (v_player->>'contact_assigned_to')::uuid;
  END IF;

  -- 12. Club members (for referral/assign dropdowns)
  SELECT COALESCE(json_agg(sub ORDER BY sub.full_name), '[]'::json) INTO v_club_members
  FROM (
    SELECT pr.id, pr.full_name
    FROM club_memberships cm
    JOIN profiles pr ON pr.id = cm.user_id
    WHERE cm.club_id = p_club_id
  ) sub;

  RETURN json_build_object(
    'player', v_player,
    'notes', v_notes,
    'status_history', v_history,
    'scouting_reports', v_reports,
    'scout_evaluations', v_evaluations,
    'quick_reports', v_quick_reports,
    'training_feedback', v_feedback,
    'videos', v_videos,
    'squads', v_squads,
    'age_group_name', v_age_group_name,
    'contact_assigned_name', v_contact_name,
    'club_members', v_club_members
  );
END;
$$;
