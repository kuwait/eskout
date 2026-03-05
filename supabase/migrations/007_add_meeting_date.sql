-- Add meeting_date column for "Reunião Marcada" status (same pattern as training_date for "Vir Treinar")
ALTER TABLE players ADD COLUMN IF NOT EXISTS meeting_date TIMESTAMPTZ;
