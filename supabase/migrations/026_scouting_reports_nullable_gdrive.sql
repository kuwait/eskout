-- supabase/migrations/026_scouting_reports_nullable_gdrive.sql
-- Allow scouting_reports without gdrive_file_id (scout-submitted reports have no PDF)
-- Reports from scouts via /submeter are inserted directly, not extracted from Google Drive
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/actions/scout-reports.ts

ALTER TABLE scouting_reports ALTER COLUMN gdrive_file_id DROP NOT NULL;
