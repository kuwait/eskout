-- supabase/migrations/002_seed_age_groups.sql
-- Seed age groups for the 2025/2026 season
-- Sub-7 to Sub-19 with corresponding generation years
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/lib/constants.ts, docs/SOP.md

INSERT INTO age_groups (name, generation_year, season) VALUES
  ('Sub-19', 2007, '2025/2026'),
  ('Sub-18', 2008, '2025/2026'),
  ('Sub-17', 2009, '2025/2026'),
  ('Sub-16', 2010, '2025/2026'),
  ('Sub-15', 2011, '2025/2026'),
  ('Sub-14', 2012, '2025/2026'),
  ('Sub-13', 2013, '2025/2026'),
  ('Sub-12', 2014, '2025/2026'),
  ('Sub-11', 2015, '2025/2026'),
  ('Sub-10', 2016, '2025/2026'),
  ('Sub-9', 2017, '2025/2026'),
  ('Sub-8', 2018, '2025/2026'),
  ('Sub-7', 2019, '2025/2026')
ON CONFLICT (generation_year, season) DO NOTHING;
