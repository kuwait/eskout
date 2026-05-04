-- Migration 116: Drop demo mode end-to-end
-- The demo feature (clubs.is_demo flag, demo@eskout.com user, "FC Atlético Demo" club,
-- /demo + /api/demo routes, DemoBanner, DemoProvider, demoGuard intent) was removed
-- because the design intent ("84 actions with demoGuard") was never actually implemented —
-- the demo user could mutate everything via every server action. Will be re-implemented
-- properly in the future if/when needed (sandbox club + read-only RLS, not flag-based).
--
-- This migration:
--   1. Deletes the demo club + cascade-deletes its data (players, squads, etc).
--   2. Deletes the demo user from auth.users (cascades to profile).
--   3. Drops the clubs.is_demo column.
--
-- Safe in any environment — uses WHERE filters that target only the seed data.
-- Re-running on a DB without demo data is a no-op.
-- RELEVANT FILES: src/lib/supabase/club-context.ts (was using is_demo), src/components/layout/AppShell.tsx

/* ───────────── 1. Delete demo club (cascade clears related data) ───────────── */

-- The demo club was seeded as "FC Atlético Demo" with slug 'fc-atletico-demo'.
-- All FK references to clubs(id) use ON DELETE CASCADE, so this purges the demo data.
DELETE FROM clubs WHERE is_demo = true;

/* ───────────── 2. Delete demo user from auth.users ───────────── */

-- profile row cascades from auth.users on delete (PK = auth.users.id).
DELETE FROM auth.users WHERE email = 'demo@eskout.com';

/* ───────────── 3. Drop the is_demo column ───────────── */

ALTER TABLE clubs DROP COLUMN IF EXISTS is_demo;
