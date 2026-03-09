-- 034_report_admin_tags.sql
-- Add admin_tags column to scouting_reports for inline quick-tagging by admins
-- Values: Prioritário, Rever, Contactar

ALTER TABLE scouting_reports
  ADD COLUMN IF NOT EXISTS admin_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_scouting_reports_admin_tags ON scouting_reports USING GIN(admin_tags);
