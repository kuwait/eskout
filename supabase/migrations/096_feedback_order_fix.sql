-- Migration 096: Ensure training feedback ordered by most recent first (date + created_at)
-- The RPC already orders by training_date DESC but needs created_at as tiebreaker
-- RELEVANT FILES: supabase/migrations/086_player_profile_rpc.sql

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
  v_reports json;
  v_notes json;
  v_history json;
  v_quick_reports json;
  v_tasks json;
  v_feedback json;
  v_videos json;
  v_squads json;
  v_age_group_name text;
  v_club_members json;
BEGIN
  -- 1. Player row
  SELECT row_to_json(p.*) INTO v_player
  FROM players p
  WHERE p.id = p_player_id AND p.club_id = p_club_id;

  IF v_player IS NULL THEN
    RETURN json_build_object('player', NULL);
  END IF;

  -- 2. Scouting reports with author names
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_reports
  FROM (
    SELECT sr.*, COALESCE(pr.full_name, 'Desconhecido') AS author_name
    FROM scouting_reports sr
    LEFT JOIN profiles pr ON pr.id = sr.created_by
    WHERE sr.player_id = p_player_id AND sr.club_id = p_club_id
  ) sub;

  -- 3. Observation notes with author names
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_notes
  FROM (
    SELECT n.*, COALESCE(pr.full_name, 'Desconhecido') AS author_name
    FROM observation_notes n
    LEFT JOIN profiles pr ON pr.id = n.author_id
    WHERE n.player_id = p_player_id AND n.club_id = p_club_id
  ) sub;

  -- 4. Status history
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_history
  FROM (
    SELECT sh.*, COALESCE(pr.full_name, 'Sistema') AS changed_by_name
    FROM status_history sh
    LEFT JOIN profiles pr ON pr.id = sh.changed_by
    WHERE sh.player_id = p_player_id AND sh.club_id = p_club_id
  ) sub;

  -- 5. Quick scout reports with author names
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_quick_reports
  FROM (
    SELECT qsr.*, COALESCE(pr.full_name, 'Desconhecido') AS author_name
    FROM quick_scout_reports qsr
    LEFT JOIN profiles pr ON pr.id = qsr.author_id
    WHERE qsr.player_id = p_player_id AND qsr.club_id = p_club_id
  ) sub;

  -- 6. User tasks for this player
  SELECT COALESCE(json_agg(sub ORDER BY sub.due_date ASC NULLS LAST, sub.created_at DESC), '[]'::json) INTO v_tasks
  FROM (
    SELECT ut.*, COALESCE(pr.full_name, 'Desconhecido') AS assigned_name,
           COALESCE(pr2.full_name, 'Sistema') AS creator_name
    FROM user_tasks ut
    LEFT JOIN profiles pr ON pr.id = ut.user_id
    LEFT JOIN profiles pr2 ON pr2.id = ut.created_by
    WHERE ut.player_id = p_player_id AND ut.club_id = p_club_id
  ) sub;

  -- 7. Training feedback with author names — ordered by date DESC, then created_at DESC
  SELECT COALESCE(json_agg(sub ORDER BY sub.training_date DESC, sub.created_at DESC), '[]'::json) INTO v_feedback
  FROM (
    SELECT tf.*, COALESCE(pr.full_name, 'Desconhecido') AS author_name
    FROM training_feedback tf
    LEFT JOIN profiles pr ON pr.id = tf.author_id
    WHERE tf.player_id = p_player_id AND tf.club_id = p_club_id
  ) sub;

  -- 8. Player videos
  SELECT COALESCE(json_agg(sub ORDER BY sub.created_at DESC), '[]'::json) INTO v_videos
  FROM (
    SELECT pv.*
    FROM player_videos pv
    WHERE pv.player_id = p_player_id AND pv.club_id = p_club_id
  ) sub;

  -- 9. Squads this player belongs to
  SELECT COALESCE(json_agg(sub ORDER BY sub.squad_name), '[]'::json) INTO v_squads
  FROM (
    SELECT sp.position, sp.sort_order, s.id AS squad_id, s.name AS squad_name, s.squad_type
    FROM squad_players sp
    JOIN squads s ON s.id = sp.squad_id
    WHERE sp.player_id = p_player_id AND s.club_id = p_club_id
  ) sub;

  -- 10. Age group name
  SELECT ag.name INTO v_age_group_name
  FROM age_groups ag
  JOIN players p ON p.age_group_id = ag.id
  WHERE p.id = p_player_id AND p.club_id = p_club_id;

  -- 11. Club members (for assignment dropdowns)
  SELECT COALESCE(json_agg(json_build_object('id', cm.user_id, 'full_name', COALESCE(pr.full_name, 'Sem nome')) ORDER BY pr.full_name), '[]'::json) INTO v_club_members
  FROM club_memberships cm
  JOIN profiles pr ON pr.id = cm.user_id
  WHERE cm.club_id = p_club_id;

  RETURN json_build_object(
    'player', v_player,
    'reports', v_reports,
    'notes', v_notes,
    'history', v_history,
    'quick_reports', v_quick_reports,
    'tasks', v_tasks,
    'training_feedback', v_feedback,
    'videos', v_videos,
    'squads', v_squads,
    'age_group_name', v_age_group_name,
    'club_members', v_club_members
  );
END;
$$;
