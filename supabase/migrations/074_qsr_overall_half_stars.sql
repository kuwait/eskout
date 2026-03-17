-- Migration 074: Change quick_scout_reports rating_overall to support half-star values (0.5-5.0)
-- Allows more granular overall rating with half-star increments

ALTER TABLE quick_scout_reports ALTER COLUMN rating_overall TYPE NUMERIC(2,1);
ALTER TABLE quick_scout_reports DROP CONSTRAINT IF EXISTS quick_scout_reports_rating_overall_check;
ALTER TABLE quick_scout_reports ADD CONSTRAINT quick_scout_reports_rating_overall_check
  CHECK (rating_overall >= 0.5 AND rating_overall <= 5.0 AND (rating_overall * 2) = ROUND(rating_overall * 2));
