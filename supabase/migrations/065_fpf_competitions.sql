-- Migration 065: FPF Competition Scraping
-- Adds tables for tracking FPF competitions, matches, player appearances, and match events.
-- Enables statistics aggregation and "Playing Up" detection (young players above their age group).
-- Global data (no club_id) — access controlled by is_superadmin / can_view_competitions.

/* ───────────── profiles: competition access flag ───────────── */

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_competitions BOOLEAN DEFAULT false;

/* ───────────── fpf_competitions ───────────── */

CREATE TABLE fpf_competitions (
  id SERIAL PRIMARY KEY,
  fpf_competition_id INTEGER NOT NULL,
  fpf_season_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  association_name TEXT,
  association_id INTEGER,
  class_id INTEGER,
  escalao TEXT,
  season TEXT NOT NULL,
  expected_birth_year_start INTEGER,
  expected_birth_year_end INTEGER,
  match_duration_minutes INTEGER DEFAULT 70,
  total_fixtures INTEGER DEFAULT 0,
  total_matches INTEGER DEFAULT 0,
  scraped_matches INTEGER DEFAULT 0,
  last_scraped_at TIMESTAMPTZ,
  scrape_status TEXT DEFAULT 'pending'
    CHECK (scrape_status IN ('pending', 'scraping', 'complete', 'error')),
  scrape_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fpf_competition_id, fpf_season_id)
);

/* ───────────── fpf_matches ───────────── */

CREATE TABLE fpf_matches (
  id SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES fpf_competitions(id) ON DELETE CASCADE,
  fpf_match_id INTEGER NOT NULL UNIQUE,
  fpf_fixture_id INTEGER NOT NULL,
  fixture_name TEXT,
  phase_name TEXT,
  series_name TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  match_date DATE,
  match_time TEXT,
  venue TEXT,
  referee TEXT,
  is_forfeit BOOLEAN DEFAULT false,
  has_lineup_data BOOLEAN DEFAULT false,
  scraped_at TIMESTAMPTZ DEFAULT now()
);

/* ───────────── fpf_match_players ───────────── */

CREATE TABLE fpf_match_players (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES fpf_matches(id) ON DELETE CASCADE,
  fpf_player_id INTEGER,
  player_name TEXT NOT NULL,
  shirt_number INTEGER,
  team_name TEXT NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  subbed_in_minute INTEGER,
  subbed_out_minute INTEGER,
  minutes_played INTEGER,
  goals INTEGER DEFAULT 0,
  penalty_goals INTEGER DEFAULT 0,
  own_goals INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  red_card_minute INTEGER,
  eskout_player_id INTEGER REFERENCES players(id),
  UNIQUE (match_id, fpf_player_id, team_name)
);

/* ───────────── fpf_match_events ───────────── */

CREATE TABLE fpf_match_events (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES fpf_matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('goal', 'penalty_goal', 'own_goal', 'yellow_card', 'red_card', 'substitution_in', 'substitution_out')),
  minute INTEGER,
  player_name TEXT NOT NULL,
  fpf_player_id INTEGER,
  team_name TEXT NOT NULL,
  related_player_name TEXT,
  related_fpf_player_id INTEGER,
  notes TEXT
);

/* ───────────── Indexes ───────────── */

CREATE INDEX idx_fpf_comp_season ON fpf_competitions(fpf_season_id);
CREATE INDEX idx_fpf_comp_assoc ON fpf_competitions(association_id);
CREATE INDEX idx_fpf_matches_comp ON fpf_matches(competition_id);
CREATE INDEX idx_fpf_matches_date ON fpf_matches(match_date);
CREATE INDEX idx_fpf_matches_fixture ON fpf_matches(fpf_fixture_id);
CREATE INDEX idx_fpf_mp_match ON fpf_match_players(match_id);
CREATE INDEX idx_fpf_mp_fpf_id ON fpf_match_players(fpf_player_id);
CREATE INDEX idx_fpf_mp_eskout ON fpf_match_players(eskout_player_id) WHERE eskout_player_id IS NOT NULL;
CREATE INDEX idx_fpf_mp_team ON fpf_match_players(team_name);
CREATE INDEX idx_fpf_mp_minutes ON fpf_match_players(minutes_played DESC NULLS LAST);
CREATE INDEX idx_fpf_mp_goals ON fpf_match_players(goals DESC) WHERE goals > 0;
CREATE INDEX idx_fpf_events_match ON fpf_match_events(match_id);
CREATE INDEX idx_fpf_events_type ON fpf_match_events(event_type);

/* ───────────── RLS ───────────── */

ALTER TABLE fpf_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpf_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpf_match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpf_match_events ENABLE ROW LEVEL SECURITY;

-- Helper: check if user can view competitions (superadmin OR delegated access)
-- Used in RLS policies below. Avoids repeating the subquery.
CREATE OR REPLACE FUNCTION can_view_fpf_competitions() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (is_superadmin = true OR can_view_competitions = true)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is superadmin (for write access)
CREATE OR REPLACE FUNCTION is_fpf_superadmin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_superadmin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- fpf_competitions: read (superadmin + delegated), write (superadmin only)
CREATE POLICY "fpf_comp_select" ON fpf_competitions
  FOR SELECT USING (can_view_fpf_competitions());
CREATE POLICY "fpf_comp_insert" ON fpf_competitions
  FOR INSERT WITH CHECK (is_fpf_superadmin());
CREATE POLICY "fpf_comp_update" ON fpf_competitions
  FOR UPDATE USING (is_fpf_superadmin());
CREATE POLICY "fpf_comp_delete" ON fpf_competitions
  FOR DELETE USING (is_fpf_superadmin());

-- fpf_matches: read (superadmin + delegated), write (superadmin only)
CREATE POLICY "fpf_matches_select" ON fpf_matches
  FOR SELECT USING (can_view_fpf_competitions());
CREATE POLICY "fpf_matches_insert" ON fpf_matches
  FOR INSERT WITH CHECK (is_fpf_superadmin());
CREATE POLICY "fpf_matches_update" ON fpf_matches
  FOR UPDATE USING (is_fpf_superadmin());
CREATE POLICY "fpf_matches_delete" ON fpf_matches
  FOR DELETE USING (is_fpf_superadmin());

-- fpf_match_players: same pattern
CREATE POLICY "fpf_mp_select" ON fpf_match_players
  FOR SELECT USING (can_view_fpf_competitions());
CREATE POLICY "fpf_mp_insert" ON fpf_match_players
  FOR INSERT WITH CHECK (is_fpf_superadmin());
CREATE POLICY "fpf_mp_update" ON fpf_match_players
  FOR UPDATE USING (is_fpf_superadmin());
CREATE POLICY "fpf_mp_delete" ON fpf_match_players
  FOR DELETE USING (is_fpf_superadmin());

-- fpf_match_events: same pattern
CREATE POLICY "fpf_events_select" ON fpf_match_events
  FOR SELECT USING (can_view_fpf_competitions());
CREATE POLICY "fpf_events_insert" ON fpf_match_events
  FOR INSERT WITH CHECK (is_fpf_superadmin());
CREATE POLICY "fpf_events_update" ON fpf_match_events
  FOR UPDATE USING (is_fpf_superadmin());
CREATE POLICY "fpf_events_delete" ON fpf_match_events
  FOR DELETE USING (is_fpf_superadmin());
