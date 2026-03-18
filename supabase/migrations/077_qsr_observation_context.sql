-- Migration 077: Add observation context fields to quick scout reports
-- Position observed, minutes watched, standout level, starter/sub, match conditions

ALTER TABLE quick_scout_reports
  ADD COLUMN observed_position TEXT,
  ADD COLUMN minutes_observed SMALLINT CHECK (minutes_observed IS NULL OR minutes_observed BETWEEN 1 AND 120),
  ADD COLUMN standout_level TEXT CHECK (standout_level IN ('Acima', 'Ao nível', 'Abaixo')),
  ADD COLUMN starter TEXT CHECK (starter IN ('Titular', 'Suplente')),
  ADD COLUMN sub_minute SMALLINT CHECK (sub_minute IS NULL OR sub_minute BETWEEN 1 AND 120),
  ADD COLUMN conditions TEXT[] DEFAULT '{}';
