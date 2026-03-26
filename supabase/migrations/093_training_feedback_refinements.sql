-- Migration 093: Training feedback refinements
-- 1. Build scale: gordo/fit/magro → ectomorfo/mesomorfo/endomorfo
-- 2. New maturation scale column
-- 3. Dual rating: rating_performance + rating_potential replace single rating
-- RELEVANT FILES: src/lib/types/index.ts, src/lib/constants.ts, src/components/players/TrainingFeedback.tsx

-- Step 1: Migrate build_scale values and update CHECK constraint
UPDATE training_feedback SET build_scale = CASE build_scale
  WHEN 'gordo' THEN 'endomorfo'
  WHEN 'fit' THEN 'mesomorfo'
  WHEN 'magro' THEN 'ectomorfo'
  ELSE build_scale
END WHERE build_scale IS NOT NULL;

ALTER TABLE training_feedback DROP CONSTRAINT IF EXISTS training_feedback_build_scale_check;
ALTER TABLE training_feedback ADD CONSTRAINT training_feedback_build_scale_check
  CHECK (build_scale IS NULL OR build_scale IN ('ectomorfo', 'mesomorfo', 'endomorfo'));

-- Same for coach_build_scale
UPDATE training_feedback SET coach_build_scale = CASE coach_build_scale
  WHEN 'gordo' THEN 'endomorfo'
  WHEN 'fit' THEN 'mesomorfo'
  WHEN 'magro' THEN 'ectomorfo'
  ELSE coach_build_scale
END WHERE coach_build_scale IS NOT NULL;

ALTER TABLE training_feedback DROP CONSTRAINT IF EXISTS training_feedback_coach_build_scale_check;
ALTER TABLE training_feedback ADD CONSTRAINT training_feedback_coach_build_scale_check
  CHECK (coach_build_scale IS NULL OR coach_build_scale IN ('ectomorfo', 'mesomorfo', 'endomorfo'));

-- Step 2: Add maturation scale
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS maturation TEXT DEFAULT NULL
  CHECK (maturation IS NULL OR maturation IN ('nada_maturado', 'a_iniciar', 'maturado', 'super_maturado'));

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS coach_maturation TEXT DEFAULT NULL
  CHECK (coach_maturation IS NULL OR coach_maturation IN ('nada_maturado', 'a_iniciar', 'maturado', 'super_maturado'));

-- Step 3: Dual rating — add performance + potential, migrate existing rating data
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS rating_performance INTEGER CHECK (rating_performance IS NULL OR (rating_performance BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS rating_potential INTEGER CHECK (rating_potential IS NULL OR (rating_potential BETWEEN 1 AND 5));

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS coach_rating_performance INTEGER CHECK (coach_rating_performance IS NULL OR (coach_rating_performance BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS coach_rating_potential INTEGER CHECK (coach_rating_potential IS NULL OR (coach_rating_potential BETWEEN 1 AND 5));

-- Migrate existing single rating to rating_performance (best guess — it was overall performance)
UPDATE training_feedback SET rating_performance = rating WHERE rating IS NOT NULL AND rating_performance IS NULL;
UPDATE training_feedback SET coach_rating_performance = coach_rating WHERE coach_rating IS NOT NULL AND coach_rating_performance IS NULL;
