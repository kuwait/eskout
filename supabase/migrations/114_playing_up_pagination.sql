-- Migration 114: Add p_offset to get_playing_up_players for client-side pagination
-- Postgrest db-max-rows caps responses at 1000 — this enables fetching beyond that
-- via repeated calls with increasing offset.
-- RELEVANT FILES: src/actions/scraping/fpf-competitions/playing-up.ts, supabase/migrations/067_playing_up_rpc.sql

CREATE OR REPLACE FUNCTION get_playing_up_players(
  p_competition_id INT,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  fpf_player_id INT,
  player_name TEXT,
  team_name TEXT,
  dob TEXT,
  birth_year INT,
  competition_escalao TEXT,
  years_above INT,
  games_started INT,
  games_as_sub INT,
  total_games INT,
  total_minutes BIGINT,
  goals BIGINT,
  penalty_goals BIGINT,
  yellow_cards BIGINT,
  red_cards BIGINT,
  eskout_player_id INT,
  is_in_eskout BOOLEAN,
  eskout_club TEXT,
  phase_name TEXT,
  series_name TEXT,
  fpf_link TEXT,
  zerozero_link TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_escalao TEXT;
  v_expected_birth_year_end INT;
BEGIN
  SELECT c.escalao, c.expected_birth_year_end
  INTO v_escalao, v_expected_birth_year_end
  FROM fpf_competitions c
  WHERE c.id = p_competition_id;

  IF v_escalao IS NULL OR v_expected_birth_year_end IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  player_stats AS (
    SELECT
      mp.fpf_player_id,
      mp.player_name,
      mp.team_name,
      m.phase_name,
      m.series_name,
      (ARRAY_AGG(mp.eskout_player_id ORDER BY mp.eskout_player_id NULLS LAST) FILTER (WHERE mp.eskout_player_id IS NOT NULL))[1] AS eskout_player_id,
      SUM(CASE WHEN mp.is_starter THEN 1 ELSE 0 END)::INT AS games_started,
      SUM(CASE WHEN NOT mp.is_starter AND COALESCE(mp.minutes_played, 0) > 0 THEN 1 ELSE 0 END)::INT AS games_as_sub,
      SUM(CASE WHEN mp.is_starter OR COALESCE(mp.minutes_played, 0) > 0 THEN 1 ELSE 0 END)::INT AS total_games,
      SUM(COALESCE(mp.minutes_played, 0)) AS total_minutes,
      SUM(mp.goals) AS goals,
      SUM(mp.penalty_goals) AS penalty_goals,
      SUM(mp.yellow_cards) AS yellow_cards,
      SUM(mp.red_cards) AS red_cards
    FROM fpf_match_players mp
    JOIN fpf_matches m ON m.id = mp.match_id
    WHERE m.competition_id = p_competition_id
      AND mp.fpf_player_id IS NOT NULL
    GROUP BY mp.fpf_player_id, mp.player_name, mp.team_name, m.phase_name, m.series_name
  ),
  with_dob AS (
    SELECT
      ps.*,
      COALESCE(p1.dob, p2.dob) AS dob,
      COALESCE(p1.id, p2.id, ps.eskout_player_id) AS resolved_eskout_id,
      COALESCE(p1.club, p2.club) AS eskout_club,
      COALESCE(p1.fpf_link, p2.fpf_link) AS fpf_link,
      COALESCE(p1.zerozero_link, p2.zerozero_link) AS zerozero_link
    FROM player_stats ps
    LEFT JOIN players p1 ON p1.id = ps.eskout_player_id
    LEFT JOIN players p2 ON p2.fpf_player_id = ps.fpf_player_id::TEXT
      AND p1.id IS NULL
  )
  SELECT
    wd.fpf_player_id,
    wd.player_name,
    wd.team_name,
    wd.dob::TEXT,
    EXTRACT(YEAR FROM wd.dob)::INT AS birth_year,
    v_escalao AS competition_escalao,
    (EXTRACT(YEAR FROM wd.dob)::INT - v_expected_birth_year_end)::INT AS years_above,
    wd.games_started,
    wd.games_as_sub,
    wd.total_games,
    wd.total_minutes,
    wd.goals,
    wd.penalty_goals,
    wd.yellow_cards,
    wd.red_cards,
    wd.resolved_eskout_id AS eskout_player_id,
    (wd.resolved_eskout_id IS NOT NULL) AS is_in_eskout,
    wd.eskout_club,
    wd.phase_name,
    wd.series_name,
    wd.fpf_link,
    wd.zerozero_link
  FROM with_dob wd
  WHERE wd.dob IS NOT NULL
    AND EXTRACT(YEAR FROM wd.dob)::INT > v_expected_birth_year_end
  ORDER BY wd.total_minutes DESC, wd.goals DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
