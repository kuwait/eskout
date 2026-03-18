-- Migration 076: Add maturation and observed foot to quick scout reports
-- Maturation: physical development stage (crucial in youth scouting)
-- Observed foot: scout's on-field observation of dominant foot

ALTER TABLE quick_scout_reports
  ADD COLUMN maturation TEXT CHECK (maturation IN ('Atrasado', 'Normal', 'Avançado')),
  ADD COLUMN observed_foot TEXT CHECK (observed_foot IN ('Direito', 'Esquerdo', 'Ambos'));
