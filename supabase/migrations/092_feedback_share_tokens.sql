-- Migration 092: External coach feedback sharing
-- Allows app users to share a training feedback link with an external coach (no login required)
-- Coach fills in evaluation data which is stored in coach_* columns on training_feedback
-- RELEVANT FILES: src/actions/training-feedback.ts, src/app/api/feedback/[token]/route.ts, src/app/feedback/[token]/page.tsx

-- Step 1: Share tokens table — tracks who shared what, expiry, usage
CREATE TABLE feedback_share_tokens (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id      UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  feedback_id  BIGINT NOT NULL REFERENCES training_feedback(id) ON DELETE CASCADE,
  token        UUID NOT NULL DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES profiles(id),
  coach_name   TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_feedback_share_token ON feedback_share_tokens(token);
CREATE INDEX idx_feedback_share_feedback ON feedback_share_tokens(feedback_id);

-- Step 2: Coach feedback columns on training_feedback — separate namespace from internal feedback
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS coach_feedback TEXT,
  ADD COLUMN IF NOT EXISTS coach_rating INTEGER CHECK (coach_rating IS NULL OR (coach_rating BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS coach_decision TEXT CHECK (coach_decision IS NULL OR coach_decision IN ('assinar', 'repetir', 'descartar', 'duvidas')),
  ADD COLUMN IF NOT EXISTS coach_height_scale TEXT CHECK (coach_height_scale IS NULL OR coach_height_scale IN ('alto', 'normal', 'baixo')),
  ADD COLUMN IF NOT EXISTS coach_build_scale TEXT CHECK (coach_build_scale IS NULL OR coach_build_scale IN ('gordo', 'fit', 'magro')),
  ADD COLUMN IF NOT EXISTS coach_speed_scale TEXT CHECK (coach_speed_scale IS NULL OR coach_speed_scale IN ('rapido', 'normal', 'lento')),
  ADD COLUMN IF NOT EXISTS coach_intensity_scale TEXT CHECK (coach_intensity_scale IS NULL OR coach_intensity_scale IN ('intenso', 'pouco_intenso')),
  ADD COLUMN IF NOT EXISTS coach_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coach_name TEXT,
  ADD COLUMN IF NOT EXISTS coach_submitted_at TIMESTAMPTZ;
