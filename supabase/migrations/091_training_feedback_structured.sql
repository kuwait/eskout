-- Migration 091: Structured training feedback — decision, physical scales, tags
-- Adds post-training decision, physical observation scales, and multi-select tags
-- RELEVANT FILES: src/actions/training-feedback.ts, src/lib/types/index.ts, src/components/players/TrainingFeedback.tsx

-- Decision: what to do with this player after training
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'sem_decisao'
  CHECK (decision IN ('assinar', 'repetir', 'descartar', 'sem_decisao'));

-- Physical scales (single-select per category, nullable = not observed)
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS height_scale TEXT DEFAULT NULL
  CHECK (height_scale IS NULL OR height_scale IN ('alto', 'normal', 'baixo'));

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS build_scale TEXT DEFAULT NULL
  CHECK (build_scale IS NULL OR build_scale IN ('gordo', 'fit', 'magro'));

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS speed_scale TEXT DEFAULT NULL
  CHECK (speed_scale IS NULL OR speed_scale IN ('rapido', 'normal', 'lento'));

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS intensity_scale TEXT DEFAULT NULL
  CHECK (intensity_scale IS NULL OR intensity_scale IN ('intenso', 'pouco_intenso'));

-- Tags: multi-select for technique, mental, adaptation observations
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
