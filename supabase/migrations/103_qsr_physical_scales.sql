-- Migration 103: Align QSR physical scales with training feedback
-- Replaces QSR-specific physical fields (height_impression, build_impression, maturation)
-- with the same scales used in training_feedback (height_scale, build_scale, speed_scale,
-- intensity_scale, maturation_scale) for consistency across all evaluation forms.

/* ───────────── Add new columns ───────────── */

ALTER TABLE quick_scout_reports
  ADD COLUMN IF NOT EXISTS height_scale TEXT,
  ADD COLUMN IF NOT EXISTS build_scale TEXT,
  ADD COLUMN IF NOT EXISTS speed_scale TEXT,
  ADD COLUMN IF NOT EXISTS intensity_scale TEXT,
  ADD COLUMN IF NOT EXISTS maturation_scale TEXT;

/* ───────────── Migrate existing data ───────────── */

-- height_impression → height_scale
UPDATE quick_scout_reports SET height_scale = CASE
  WHEN height_impression = 'Alto' THEN 'alto'
  WHEN height_impression = 'Médio' THEN 'normal'
  WHEN height_impression = 'Baixo' THEN 'baixo'
  ELSE NULL
END WHERE height_impression IS NOT NULL;

-- build_impression → build_scale
UPDATE quick_scout_reports SET build_scale = CASE
  WHEN build_impression = 'Robusto' THEN 'endomorfo'
  WHEN build_impression = 'Normal' THEN 'mesomorfo'
  WHEN build_impression = 'Magro' THEN 'ectomorfo'
  ELSE NULL
END WHERE build_impression IS NOT NULL;

-- maturation → maturation_scale (3 values → 4 values mapping)
UPDATE quick_scout_reports SET maturation_scale = CASE
  WHEN maturation = 'Atrasado' THEN 'nada_maturado'
  WHEN maturation = 'Normal' THEN 'maturado'
  WHEN maturation = 'Avançado' THEN 'super_maturado'
  ELSE NULL
END WHERE maturation IS NOT NULL;

/* ───────────── Drop old columns ───────────── */

ALTER TABLE quick_scout_reports
  DROP COLUMN IF EXISTS height_impression,
  DROP COLUMN IF EXISTS build_impression;
-- Keep maturation column for now — it's also used as observation context (different semantics)
-- The QSR maturation (Atrasado/Normal/Avançado) is observation-level,
-- maturation_scale is the physical scale. Both can coexist.
