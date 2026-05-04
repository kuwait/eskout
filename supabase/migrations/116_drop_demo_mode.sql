-- Migration 116: Drop demo mode end-to-end
-- The demo feature (clubs.is_demo flag, demo@eskout.com user, "FC Atlético Demo" club,
-- /demo + /api/demo routes, DemoBanner, DemoProvider, demoGuard intent) was removed
-- because the design intent ("84 actions with demoGuard") was never actually implemented —
-- the demo user could mutate everything via every server action. Will be re-implemented
-- properly in the future if/when needed (sandbox club + read-only RLS, not flag-based).
--
-- This migration:
--   1. Adds ON DELETE CASCADE to squads.club_id + squad_players.club_id (P1 audit fix —
--      migration 059 created these without a cascade clause, blocking club deletion).
--   2. Deletes the demo club + cascade-deletes its data (players, squads, etc).
--   3. Clears any auth.users references from the demo user that lack ON DELETE clauses.
--   4. Deletes the demo user from auth.users.
--   5. Drops the clubs.is_demo column.
--
-- Idempotent — safe to re-run on a DB without demo data.
-- RELEVANT FILES: src/lib/supabase/club-context.ts (was using is_demo), src/components/layout/AppShell.tsx

/* ───────────── 1. Fix missing CASCADE on squads/squad_players → clubs FK ───────────── */

ALTER TABLE squads DROP CONSTRAINT IF EXISTS squads_club_id_fkey;
ALTER TABLE squads
  ADD CONSTRAINT squads_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE squad_players DROP CONSTRAINT IF EXISTS squad_players_club_id_fkey;
ALTER TABLE squad_players
  ADD CONSTRAINT squad_players_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

/* ───────────── 2. Delete demo club (cascade clears related data) ───────────── */

DELETE FROM clubs WHERE is_demo = true;

/* ───────────── 3-4. Clear auth.users refs + delete demo user ───────────── */

-- Demo user may have created rows in tables whose created_by/changed_by/author_id FKs
-- to auth.users lack ON DELETE clauses. Null them out before deleting the user.
DO $$
DECLARE demo_user_id UUID;
BEGIN
  SELECT id INTO demo_user_id FROM auth.users WHERE email = 'demo@eskout.com';
  IF demo_user_id IS NULL THEN RETURN; END IF;

  UPDATE status_history     SET changed_by = NULL WHERE changed_by = demo_user_id;
  UPDATE observation_notes  SET author_id  = NULL WHERE author_id  = demo_user_id;
  UPDATE calendar_events    SET created_by = NULL WHERE created_by = demo_user_id;
  UPDATE players            SET created_by = NULL WHERE created_by = demo_user_id;

  -- profile.id is FK to auth.users(id) without ON DELETE — must delete profile first.
  DELETE FROM profiles WHERE id = demo_user_id;
  DELETE FROM auth.users WHERE id = demo_user_id;
END $$;

/* ───────────── 5. Drop the is_demo column ───────────── */

ALTER TABLE clubs DROP COLUMN IF EXISTS is_demo;
