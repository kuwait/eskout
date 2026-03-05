-- Add height, weight, birth_country, nationality to players table
-- These fields are populated from FPF (nationality, birth_country) and ZeroZero (height, weight) scrapers

ALTER TABLE players ADD COLUMN IF NOT EXISTS height smallint;
ALTER TABLE players ADD COLUMN IF NOT EXISTS weight smallint;
ALTER TABLE players ADD COLUMN IF NOT EXISTS birth_country text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS nationality text;
