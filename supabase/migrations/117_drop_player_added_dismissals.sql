-- Migration 117: Remove "Jogadores Adicionados" feature
-- A tab /admin/pendentes mostrava jogadores adicionados por outros utilizadores ao
-- clube com possibilidade de dismiss per-user. Feature removida porque já não é usada.
--
-- Esta migration:
--   1. Drops the player_added_dismissals table.
--   2. Updates the get_appshell_counts RPC to remove pending_players from the response
--      (drops the variable + the field in RETURN JSON).
--
-- Idempotente — re-run safe (DROP IF EXISTS + CREATE OR REPLACE).
-- RELEVANT FILES: supabase/migrations/049_player_added_dismissals.sql, supabase/migrations/099_training_feedback_seen_at.sql

/* ───────────── 1. Drop table ───────────── */

DROP TABLE IF EXISTS player_added_dismissals;

/* ───────────── 2. Update RPC — remove pending_players ───────────── */

-- Mirrors 099 (latest version) minus the pending_players block + return field.
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
  v_new_feedbacks int;
  v_seen_at timestamptz;
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

  -- 6. New training feedbacks (admin/editor only) — created after user's last visit
  v_new_feedbacks := 0;
  IF p_user_role IN ('admin', 'editor') THEN
    SELECT training_feedback_seen_at INTO v_seen_at
    FROM club_memberships
    WHERE club_id = p_club_id AND user_id = p_user_id;

    IF v_seen_at IS NULL THEN
      -- Never visited: count all non-stub feedbacks
      SELECT count(*) INTO v_new_feedbacks
      FROM training_feedback
      WHERE club_id = p_club_id
        AND (feedback IS NOT NULL OR rating_performance IS NOT NULL OR coach_submitted_at IS NOT NULL);
    ELSE
      SELECT count(*) INTO v_new_feedbacks
      FROM training_feedback
      WHERE club_id = p_club_id
        AND created_at > v_seen_at
        AND (feedback IS NOT NULL OR rating_performance IS NOT NULL OR coach_submitted_at IS NOT NULL);
    END IF;
  END IF;

  RETURN json_build_object(
    'urgente', v_urgente,
    'importante', v_importante,
    'pending_reports', v_pending_reports,
    'pending_tasks', v_pending_tasks,
    'observation_count', v_observation_count,
    'new_feedbacks', v_new_feedbacks
  );
END;
$$;
