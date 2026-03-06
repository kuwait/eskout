-- Add club_logo_url column to players table
-- Stores the club badge/logo image URL scraped from FPF or ZeroZero
ALTER TABLE players ADD COLUMN IF NOT EXISTS club_logo_url TEXT;
