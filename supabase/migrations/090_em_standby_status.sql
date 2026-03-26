-- Migration 090: Add 'em_standby' recruitment status with standby_reason text field
-- New pipeline column between 'a_decidir' and 'confirmado' — requires mandatory reason text
-- RELEVANT FILES: 054_remove_a_observar_status.sql, src/lib/types/index.ts, src/actions/pipeline.ts

-- Step 1: Add standby_reason column
ALTER TABLE players ADD COLUMN IF NOT EXISTS standby_reason TEXT DEFAULT NULL;

-- Step 2: Update CHECK constraint to include em_standby
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_recruitment_status_check;
ALTER TABLE players ADD CONSTRAINT players_recruitment_status_check CHECK (
  recruitment_status IS NULL OR recruitment_status IN (
    'por_tratar', 'em_contacto', 'vir_treinar',
    'reuniao_marcada', 'a_decidir', 'em_standby', 'confirmado', 'assinou', 'rejeitado'
  )
);

-- Step 3: Index for quick filtering of standby players
CREATE INDEX IF NOT EXISTS idx_players_em_standby ON players(recruitment_status) WHERE recruitment_status = 'em_standby';
