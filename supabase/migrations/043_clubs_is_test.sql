-- supabase/migrations/043_clubs_is_test.sql
-- Add is_test flag to clubs to exclude test data from superadmin dashboard stats
-- RELEVANT FILES: src/app/master/page.tsx, src/app/master/online/page.tsx

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Mark known test club
UPDATE clubs SET is_test = true WHERE name = 'Clube de Teste E2E';
