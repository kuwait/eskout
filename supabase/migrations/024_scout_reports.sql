-- supabase/migrations/024_scout_reports.sql
-- Table for scout-submitted reports via the /submeter form (not PDF-extracted)
-- Scouts fill this in at the field on their phone during/after a match
-- RELEVANT FILES: src/actions/scout-reports.ts, src/app/submeter/page.tsx, supabase/migrations/001_initial_schema.sql

CREATE TABLE scout_reports (
  id SERIAL PRIMARY KEY,
  author_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Player identification
  player_name TEXT NOT NULL,
  player_club TEXT NOT NULL,
  fpf_link TEXT NOT NULL,
  zerozero_link TEXT,

  -- Match context
  competition TEXT,
  match TEXT,
  match_date DATE,
  match_result TEXT,

  -- Player data observed
  shirt_number TEXT,
  birth_year TEXT,
  foot TEXT CHECK (foot IN ('Dir', 'Esq', 'Amb') OR foot IS NULL),
  position TEXT,

  -- Evaluation
  physical_profile TEXT,
  strengths TEXT,
  weaknesses TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  decision TEXT,
  analysis TEXT,
  contact_info TEXT,

  -- Processing status — admin reviews and links to a player
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  linked_player_id INT REFERENCES players(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scout_reports_author ON scout_reports(author_id);
CREATE INDEX idx_scout_reports_status ON scout_reports(status);

-- RLS
ALTER TABLE scout_reports ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read (admins/editors see all, scouts filtered in app)
CREATE POLICY "read_scout_reports" ON scout_reports
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Scouts can insert their own reports
CREATE POLICY "insert_scout_reports" ON scout_reports
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Admins and editors can update (review/approve/link)
CREATE POLICY "admin_editor_update_scout_reports" ON scout_reports
  FOR UPDATE USING (public.is_admin_or_editor());

-- Only admins can delete
CREATE POLICY "admin_delete_scout_reports" ON scout_reports
  FOR DELETE USING (public.is_admin());
