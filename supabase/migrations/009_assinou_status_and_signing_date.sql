-- 009_assinou_status_and_signing_date.sql
-- Add "assinou" recruitment status (after confirmado) and signing_date column on confirmado
-- Confirmado = confirmed coming, Assinou = actually signed the contract

-- Add signing_date column for players in 'confirmado' status
ALTER TABLE players ADD COLUMN IF NOT EXISTS signing_date TIMESTAMPTZ DEFAULT NULL;

-- Update CHECK constraint to include 'assinou'
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_recruitment_status_check;
ALTER TABLE players ADD CONSTRAINT players_recruitment_status_check
  CHECK (recruitment_status IN (
    'por_tratar', 'a_observar', 'em_contacto', 'vir_treinar',
    'reuniao_marcada', 'a_decidir', 'confirmado', 'assinou', 'rejeitado'
  ) OR recruitment_status IS NULL);
