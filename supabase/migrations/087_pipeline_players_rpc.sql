-- Migration 087: Pipeline players RPC
-- Returns pipeline players + contact purpose labels in a single round-trip
-- Replaces: pagination loop (1000-row pages) + sequential contact purpose fetch

CREATE OR REPLACE FUNCTION get_pipeline_players(
  p_club_id uuid,
  p_age_group_id int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players json;
  v_contact_purposes json;
BEGIN
  -- 1. All players with a recruitment_status (in the pipeline)
  SELECT COALESCE(json_agg(p.* ORDER BY p.name), '[]'::json) INTO v_players
  FROM players p
  WHERE p.club_id = p_club_id
    AND p.recruitment_status IS NOT NULL
    AND (p_age_group_id IS NULL OR p.age_group_id = p_age_group_id);

  -- 2. Latest contact purpose for each em_contacto player
  -- Uses DISTINCT ON to get the most recent entry per player
  SELECT COALESCE(json_agg(sub), '[]'::json) INTO v_contact_purposes
  FROM (
    SELECT DISTINCT ON (sh.player_id)
      sh.player_id,
      CASE
        WHEN sh.contact_purpose_id IS NOT NULL THEN cp.label
        ELSE sh.contact_purpose_custom
      END AS purpose_label
    FROM status_history sh
    LEFT JOIN contact_purposes cp ON cp.id = sh.contact_purpose_id
    JOIN players p ON p.id = sh.player_id
      AND p.club_id = p_club_id
      AND p.recruitment_status = 'em_contacto'
    WHERE sh.field_changed = 'recruitment_status'
      AND sh.new_value = 'em_contacto'
      AND (sh.contact_purpose_id IS NOT NULL OR sh.contact_purpose_custom IS NOT NULL)
      AND (p_age_group_id IS NULL OR p.age_group_id = p_age_group_id)
    ORDER BY sh.player_id, sh.created_at DESC
  ) sub;

  RETURN json_build_object(
    'players', v_players,
    'contact_purposes', v_contact_purposes
  );
END;
$$;
