-- supabase/migrations/025_scout_reports_extra_fields.sql
-- Add all scraped data fields to scout_reports so admin can create player directly from report
-- Auto-populated from FPF/ZZ scrape, not manually entered by scouts
-- RELEVANT FILES: supabase/migrations/024_scout_reports.sql, src/actions/scout-reports.ts, src/app/submeter/page.tsx

ALTER TABLE scout_reports
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS birth_country TEXT,
  ADD COLUMN IF NOT EXISTS height INT,
  ADD COLUMN IF NOT EXISTS weight INT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS secondary_position TEXT,
  ADD COLUMN IF NOT EXISTS tertiary_position TEXT,
  ADD COLUMN IF NOT EXISTS fpf_player_id TEXT,
  ADD COLUMN IF NOT EXISTS zerozero_player_id TEXT;
