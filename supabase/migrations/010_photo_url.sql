-- Add photo_url column for manually-set player photo URLs (FPF, ZeroZero, etc.)
-- Separate from zz_photo_url which is auto-scraped from ZeroZero
ALTER TABLE players ADD COLUMN IF NOT EXISTS photo_url TEXT;
