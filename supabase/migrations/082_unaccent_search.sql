-- Migration 082: Enable unaccent extension + accent-insensitive player search RPC
-- Allows searching "coimbroes" to match "Coimbrões", "joao" to match "João", etc.
-- Used by player picker dialogs (AddToSquadDialog, PlayerPickerDialog, PlayersView)

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Accent+case insensitive search: returns players matching ALL words across name+club
-- Each word must appear in either name OR club (cross-field matching)
-- Words are matched with unaccent + ilike for accent-insensitive comparison
CREATE OR REPLACE FUNCTION search_players_unaccent(
  p_club_id uuid,
  p_words text[],
  p_position text DEFAULT NULL,
  p_club text DEFAULT NULL,
  p_opinion text DEFAULT NULL,
  p_foot text DEFAULT NULL,
  p_exclude_ids int[] DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS SETOF players
LANGUAGE sql STABLE
AS $$
  SELECT p.*
  FROM players p
  WHERE p.club_id = p_club_id
    AND p.pending_approval = false
    -- Each word must match name OR club (accent-insensitive)
    AND (
      array_length(p_words, 1) IS NULL
      OR (
        SELECT bool_and(
          unaccent(lower(p.name)) LIKE '%' || unaccent(lower(w)) || '%'
          OR unaccent(lower(COALESCE(p.club, ''))) LIKE '%' || unaccent(lower(w)) || '%'
        )
        FROM unnest(p_words) AS w
      )
    )
    -- Optional structural filters
    AND (p_position IS NULL OR p.position_normalized = p_position OR p.secondary_position = p_position OR p.tertiary_position = p_position)
    AND (p_club IS NULL OR p.club = p_club)
    AND (p_opinion IS NULL OR p.department_opinion::text[] @> ARRAY[p_opinion]::text[])
    AND (p_foot IS NULL OR p.foot = p_foot)
    AND (p_exclude_ids IS NULL OR p.id != ALL(p_exclude_ids))
  ORDER BY p.name
  LIMIT p_limit;
$$;
