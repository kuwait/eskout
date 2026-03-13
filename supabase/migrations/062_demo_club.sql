-- supabase/migrations/062_demo_club.sql
-- Add is_demo flag to clubs to identify demo/showcase clubs
-- Demo clubs are read-only — all mutations are blocked at the server action level
-- RELEVANT FILES: src/lib/supabase/club-context.ts, scripts/seed_demo.ts

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
