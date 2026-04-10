-- Migration 105: JWT custom claims for role, superadmin, and club memberships
-- Stores club_roles, is_superadmin, can_view_competitions in auth.users.raw_app_meta_data
-- so middleware and server code can read them from the JWT without extra DB queries.
-- RELEVANT FILES: src/middleware.ts, src/lib/supabase/club-context.ts, supabase/migrations/032_fix_club_memberships_rls.sql

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: Function to sync user claims into JWT app_metadata
-- ═══════════════════════════════════════════════════════════════
-- SECURITY DEFINER: required to write to auth.users (owned by supabase_auth_admin)
-- SET search_path: prevents search_path injection attacks
-- Uses jsonb || operator to MERGE — does NOT overwrite existing fields (provider, providers, etc.)

CREATE OR REPLACE FUNCTION public.sync_user_claims(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clubs_json JSONB;
  v_is_superadmin BOOLEAN;
  v_can_view_competitions BOOLEAN;
BEGIN
  -- Build club roles map: {"club-uuid-1": "admin", "club-uuid-2": "scout"}
  SELECT COALESCE(jsonb_object_agg(club_id::text, role), '{}'::jsonb)
  INTO clubs_json
  FROM club_memberships
  WHERE user_id = target_user_id;

  -- Get superadmin + competition flags from profiles
  SELECT
    COALESCE(is_superadmin, false),
    COALESCE(can_view_competitions, false)
  INTO v_is_superadmin, v_can_view_competitions
  FROM profiles
  WHERE id = target_user_id;

  -- Merge into existing app_metadata (preserves provider, providers, etc.)
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'club_roles', clubs_json,
      'is_superadmin', COALESCE(v_is_superadmin, false),
      'can_view_competitions', COALESCE(v_can_view_competitions, false)
    )
  WHERE id = target_user_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: Trigger function for club_memberships changes
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.on_club_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On DELETE, sync the old user; on INSERT/UPDATE, sync the new user
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_user_claims(OLD.user_id);
  ELSE
    PERFORM sync_user_claims(NEW.user_id);
    -- If user_id changed (unlikely but safe), also sync the old user
    IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM sync_user_claims(OLD.user_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: Trigger function for profiles changes
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.on_profile_flags_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only sync if relevant flags actually changed
  IF OLD.is_superadmin IS DISTINCT FROM NEW.is_superadmin
    OR OLD.can_view_competitions IS DISTINCT FROM NEW.can_view_competitions THEN
    PERFORM sync_user_claims(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: Create triggers
-- ═══════════════════════════════════════════════════════════════

-- Drop if exists (safe re-run)
DROP TRIGGER IF EXISTS trg_club_membership_claims ON club_memberships;
DROP TRIGGER IF EXISTS trg_profile_flags_claims ON profiles;

-- Membership changes → sync claims
CREATE TRIGGER trg_club_membership_claims
  AFTER INSERT OR UPDATE OR DELETE ON club_memberships
  FOR EACH ROW
  EXECUTE FUNCTION on_club_membership_change();

-- Profile flag changes → sync claims
CREATE TRIGGER trg_profile_flags_claims
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION on_profile_flags_change();

-- ═══════════════════════════════════════════════════════════════
-- STEP 5: Backfill — sync claims for ALL existing users
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid UUID;
BEGIN
  FOR uid IN SELECT id FROM profiles LOOP
    PERFORM sync_user_claims(uid);
  END LOOP;
END;
$$;
