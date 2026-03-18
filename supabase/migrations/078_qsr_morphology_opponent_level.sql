-- Migration 078: Add morphology and opponent level to quick scout reports
-- Morphology: physical build impression (height + build) — critical for youth scouting
-- Opponent level: contextualizes standout_level and overall evaluation

ALTER TABLE quick_scout_reports
  ADD COLUMN height_impression TEXT CHECK (height_impression IN ('Baixo', 'Médio', 'Alto')),
  ADD COLUMN build_impression TEXT CHECK (build_impression IN ('Magro', 'Normal', 'Robusto')),
  ADD COLUMN opponent_level TEXT CHECK (opponent_level IN ('Forte', 'Médio', 'Fraco'));
