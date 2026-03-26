-- Migration 095: Add observed position to coach feedback
-- The external coach can note what position the player played during the training session
-- RELEVANT FILES: src/components/feedback/CoachFeedbackForm.tsx, src/app/api/feedback/[token]/route.ts

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS coach_observed_position TEXT DEFAULT NULL;
