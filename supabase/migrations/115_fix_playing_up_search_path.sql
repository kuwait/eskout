-- Migration 115: Restore SET search_path on get_playing_up_players
-- Migration 084 added `ALTER FUNCTION ... SET search_path = public` to harden against
-- search-path injection (CVE-2018-1058). Migration 114 then re-defined the function via
-- CREATE OR REPLACE which silently dropped that setting. This migration re-applies it.
-- Idempotent — `ALTER FUNCTION ... SET` overwrites any existing config.
-- RELEVANT FILES: supabase/migrations/084_security_advisor_fixes.sql, supabase/migrations/114_playing_up_pagination.sql

ALTER FUNCTION get_playing_up_players(INT, INT, INT) SET search_path = public;
