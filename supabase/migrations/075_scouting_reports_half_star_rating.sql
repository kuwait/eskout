-- Migration 075: Change scouting_reports rating to support half-star values (0.5-5.0)
-- Aligns with quick_scout_reports which already supports half-stars

ALTER TABLE scouting_reports ALTER COLUMN rating TYPE NUMERIC(2,1);
