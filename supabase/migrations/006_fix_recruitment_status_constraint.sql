-- supabase/migrations/006_fix_recruitment_status_constraint.sql
-- Update CHECK constraint on recruitment_status from English to Portuguese values
-- The app code sends Portuguese values but the DB constraint still had English ones
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, src/lib/types/index.ts, src/actions/pipeline.ts

-- Step 1: Drop the old English constraint
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_recruitment_status_check;

-- Step 2: Migrate existing data from English to Portuguese
UPDATE players SET recruitment_status = CASE recruitment_status
  WHEN 'pool' THEN NULL
  WHEN 'shortlist' THEN 'por_tratar'
  WHEN 'to_observe' THEN 'a_observar'
  WHEN 'target' THEN 'em_contacto'
  WHEN 'in_contact' THEN 'em_contacto'
  WHEN 'negotiating' THEN 'a_decidir'
  WHEN 'confirmed' THEN 'confirmado'
  WHEN 'rejected' THEN 'rejeitado'
  ELSE recruitment_status
END
WHERE recruitment_status IN ('pool','shortlist','to_observe','target','in_contact','negotiating','confirmed','rejected');

-- Step 3: Add new constraint with Portuguese values (NULL allowed = not in pipeline)
ALTER TABLE players ADD CONSTRAINT players_recruitment_status_check
  CHECK (recruitment_status IN (
    'por_tratar', 'a_observar', 'em_contacto', 'vir_treinar',
    'reuniao_marcada', 'a_decidir', 'confirmado', 'rejeitado'
  ) OR recruitment_status IS NULL);
