-- supabase/migrations/001_initial_schema.sql
-- Full database schema for the Eskout scouting application
-- Creates all tables, indexes, and RLS policies per SOP Section 5.4
-- RELEVANT FILES: supabase/migrations/002_seed_age_groups.sql, src/lib/types/index.ts, docs/SOP.md

-- ============================================
-- TABLE: profiles (extends Supabase Auth users)
-- ============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'scout')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: age_groups
-- ============================================
CREATE TABLE age_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  generation_year INT NOT NULL,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(generation_year, season)
);

-- ============================================
-- TABLE: players
-- ============================================
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  age_group_id INT REFERENCES age_groups(id),

  -- Basic data
  name TEXT NOT NULL,
  dob DATE,
  club TEXT,
  position_original TEXT,
  position_normalized TEXT
    CHECK (position_normalized IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR position_normalized IS NULL),
  foot TEXT CHECK (foot IN ('Dir', 'Esq', 'Amb') OR foot IS NULL),
  shirt_number TEXT,
  contact TEXT,

  -- Internal classifications
  department_opinion TEXT,
  observer TEXT,
  observer_eval TEXT,
  observer_decision TEXT,
  referred_by TEXT,
  notes TEXT,

  -- Report labels (from Excel cell values)
  report_label_1 TEXT,
  report_label_2 TEXT,
  report_label_3 TEXT,
  report_label_4 TEXT,
  report_label_5 TEXT,
  report_label_6 TEXT,

  -- Report Google Drive links (from Excel hyperlinks)
  report_link_1 TEXT,
  report_link_2 TEXT,
  report_link_3 TEXT,
  report_link_4 TEXT,
  report_link_5 TEXT,
  report_link_6 TEXT,

  -- External links
  fpf_link TEXT,
  fpf_player_id TEXT,
  zerozero_link TEXT,
  zerozero_player_id TEXT,

  -- FPF scraped data
  fpf_current_club TEXT,
  fpf_last_checked TIMESTAMPTZ,

  -- ZeroZero scraped data
  zz_current_club TEXT,
  zz_current_team TEXT,
  zz_games_season INT,
  zz_goals_season INT,
  zz_height INT,
  zz_weight INT,
  zz_photo_url TEXT,
  zz_team_history JSONB,
  zz_last_checked TIMESTAMPTZ,

  -- Recruitment
  recruitment_status TEXT DEFAULT 'pool'
    CHECK (recruitment_status IN ('pool','shortlist','to_observe','target','in_contact','negotiating','confirmed','rejected')),
  recruitment_notes TEXT,

  -- Squad membership
  is_real_squad BOOLEAN DEFAULT FALSE,
  is_shadow_squad BOOLEAN DEFAULT FALSE,
  shadow_position TEXT
    CHECK (shadow_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR shadow_position IS NULL),

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- TABLE: scouting_reports (extracted from PDFs)
-- ============================================
CREATE TABLE scouting_reports (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,

  gdrive_file_id TEXT NOT NULL,
  gdrive_link TEXT,
  report_number INT,
  pdf_filename TEXT,

  competition TEXT,
  age_group TEXT,
  match TEXT,
  match_date DATE,
  match_result TEXT,

  player_name_report TEXT,
  shirt_number_report TEXT,
  birth_year_report TEXT,
  foot_report TEXT,
  team_report TEXT,
  position_report TEXT,

  physical_profile TEXT,
  strengths TEXT,
  weaknesses TEXT,

  rating INT CHECK (rating BETWEEN 1 AND 5),
  decision TEXT,
  analysis TEXT,

  contact_info TEXT,
  scout_name TEXT,

  raw_text TEXT,
  extraction_status TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'success', 'partial', 'error')),
  extraction_error TEXT,
  extracted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: status_history (change log)
-- ============================================
CREATE TABLE status_history (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: observation_notes (scout notes)
-- ============================================
CREATE TABLE observation_notes (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  match_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_players_age_group ON players(age_group_id);
CREATE INDEX idx_players_position ON players(position_normalized);
CREATE INDEX idx_players_status ON players(recruitment_status);
CREATE INDEX idx_players_shadow ON players(is_shadow_squad);
CREATE INDEX idx_players_real ON players(is_real_squad);
CREATE INDEX idx_players_opinion ON players(department_opinion);
CREATE INDEX idx_reports_player ON scouting_reports(player_id);
CREATE INDEX idx_reports_status ON scouting_reports(extraction_status);
CREATE INDEX idx_history_player ON status_history(player_id);
CREATE INDEX idx_notes_player ON observation_notes(player_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE age_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "read_all_players" ON players FOR SELECT USING (true);
CREATE POLICY "read_all_reports" ON scouting_reports FOR SELECT USING (true);
CREATE POLICY "read_all_history" ON status_history FOR SELECT USING (true);
CREATE POLICY "read_all_notes" ON observation_notes FOR SELECT USING (true);
CREATE POLICY "read_all_age_groups" ON age_groups FOR SELECT USING (true);
CREATE POLICY "read_own_profile" ON profiles FOR SELECT USING (true);

-- Admins can write everything
CREATE POLICY "admin_write_players" ON players FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_write_reports" ON scouting_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_write_age_groups" ON age_groups FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_write_profiles" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Scouts can insert players and notes
CREATE POLICY "scout_insert_players" ON players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'scout'))
);
CREATE POLICY "anyone_insert_notes" ON observation_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id
);

-- System inserts history
CREATE POLICY "system_insert_history" ON status_history FOR INSERT WITH CHECK (true);

-- ============================================
-- TRIGGER: auto-update updated_at on players
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
