-- Migration 085: Consolidated AppShell alert counts RPC
-- Replaces 7+ separate count queries with a single function call
-- Returns all badge counts needed by the app shell in one round-trip

CREATE OR REPLACE FUNCTION get_appshell_counts(
  p_club_id uuid,
  p_user_id uuid,
  p_user_role text DEFAULT 'scout'
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_urgente int;
  v_importante int;
  v_pending_reports int;
  v_pending_tasks int;
  v_observation_count int;
  v_pending_players int;
  v_players_total int;
  v_dismissed int;
BEGIN
  -- 1. Urgente notes count
  SELECT count(*) INTO v_urgente
  FROM observation_notes
  WHERE club_id = p_club_id AND priority = 'urgente';

  -- 2. Importante notes count
  SELECT count(*) INTO v_importante
  FROM observation_notes
  WHERE club_id = p_club_id AND priority = 'importante';

  -- 3. Pending scouting reports count
  SELECT count(*) INTO v_pending_reports
  FROM scouting_reports
  WHERE club_id = p_club_id AND status = 'pendente';

  -- 4. Pending user tasks count
  SELECT count(*) INTO v_pending_tasks
  FROM user_tasks
  WHERE club_id = p_club_id AND user_id = p_user_id AND completed = false;

  -- 5. Observation count: total items across all user lists (single aggregate)
  SELECT COALESCE(sum(sub.cnt), 0)::int INTO v_observation_count
  FROM (
    SELECT count(*) AS cnt
    FROM player_list_items pli
    JOIN player_lists pl ON pl.id = pli.list_id
    WHERE pl.club_id = p_club_id AND pl.user_id = p_user_id
  ) sub;

  -- 6. Pending players count (role-dependent)
  v_pending_players := 0;
  IF p_user_role IN ('admin', 'editor') THEN
    IF p_user_role = 'admin' THEN
      -- Admin: count players not created by this user
      SELECT count(*) INTO v_players_total
      FROM players
      WHERE club_id = p_club_id AND created_by != p_user_id;
    ELSE
      -- Editor: count players not created by this user AND not by admins
      SELECT count(*) INTO v_players_total
      FROM players
      WHERE club_id = p_club_id
        AND created_by != p_user_id
        AND created_by NOT IN (
          SELECT user_id FROM club_memberships
          WHERE club_id = p_club_id AND role = 'admin'
        );
    END IF;

    -- Subtract dismissals
    SELECT count(*) INTO v_dismissed
    FROM player_added_dismissals
    WHERE user_id = p_user_id;

    v_pending_players := GREATEST(0, v_players_total - v_dismissed);
  END IF;

  RETURN json_build_object(
    'urgente', v_urgente,
    'importante', v_importante,
    'pending_reports', v_pending_reports,
    'pending_tasks', v_pending_tasks,
    'observation_count', v_observation_count,
    'pending_players', v_pending_players
  );
END;
$$;
