-- supabase/migrations/063_fix_age_groups_unique_constraint.sql
-- Fix age_groups unique constraint to be club-scoped instead of global
-- The old constraint (generation_year, season) prevented multiple clubs from having the same age group
-- RELEVANT FILES: supabase/migrations/001_initial_schema.sql, scripts/seed_demo.ts

-- Drop the global unique constraint
ALTER TABLE age_groups DROP CONSTRAINT IF EXISTS age_groups_generation_year_season_key;

-- Create a club-scoped unique constraint instead
-- Each club can have its own set of age groups
ALTER TABLE age_groups ADD CONSTRAINT age_groups_club_gen_season_key
  UNIQUE (club_id, generation_year, season);
