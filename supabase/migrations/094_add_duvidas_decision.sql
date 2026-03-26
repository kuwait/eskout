-- Migration 094: Add 'duvidas' to training feedback decision CHECK constraint
-- Aligns internal decisions with coach decisions (both now support duvidas)
-- RELEVANT FILES: src/lib/types/index.ts, src/lib/constants.ts

ALTER TABLE training_feedback DROP CONSTRAINT IF EXISTS training_feedback_decision_check;
ALTER TABLE training_feedback ADD CONSTRAINT training_feedback_decision_check
  CHECK (decision IN ('assinar', 'repetir', 'duvidas', 'descartar', 'sem_decisao'));
