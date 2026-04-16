-- Migration 108: Estende get_pipeline_players RPC para incluir treinos do ciclo actual
-- Para players em vir_treinar, retorna também as sessões de treino criadas após
-- players.vir_treinar_entered_at (ciclo actual) — evita N+1 queries no pipeline card.
-- RELEVANT FILES: src/lib/supabase/queries.ts, src/components/pipeline/PipelineCard.tsx

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
  v_training_sessions json;
BEGIN
  -- 1. Todos os players com recruitment_status
  SELECT COALESCE(json_agg(p.* ORDER BY p.name), '[]'::json) INTO v_players
  FROM players p
  WHERE p.club_id = p_club_id
    AND p.recruitment_status IS NOT NULL
    AND (p_age_group_id IS NULL OR p.age_group_id = p_age_group_id);

  -- 2. Contact purposes dos em_contacto (último por player)
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

  -- 3. Training sessions do ciclo actual — só players em vir_treinar
  -- Filtro: criados após vir_treinar_entered_at AND não retroactivos AND estado visível
  SELECT COALESCE(json_agg(sub ORDER BY sub.player_id, sub.training_date ASC, sub.session_time ASC NULLS LAST), '[]'::json)
    INTO v_training_sessions
  FROM (
    SELECT
      tf.id,
      tf.player_id,
      tf.training_date,
      tf.session_time,
      tf.status,
      tf.escalao,
      tf.location,
      tf.feedback IS NOT NULL
        OR tf.rating_performance IS NOT NULL
        OR tf.rating_potential IS NOT NULL
        OR tf.coach_submitted_at IS NOT NULL
        AS has_evaluation
    FROM training_feedback tf
    JOIN players p ON p.id = tf.player_id
      AND p.club_id = p_club_id
      AND p.recruitment_status = 'vir_treinar'
      AND (p_age_group_id IS NULL OR p.age_group_id = p_age_group_id)
    WHERE tf.is_retroactive = false
      AND tf.status IN ('agendado', 'realizado')
      AND (p.vir_treinar_entered_at IS NULL OR tf.created_at >= p.vir_treinar_entered_at)
  ) sub;

  RETURN json_build_object(
    'players', v_players,
    'contact_purposes', v_contact_purposes,
    'training_sessions', v_training_sessions
  );
END;
$$;
