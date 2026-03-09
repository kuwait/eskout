-- supabase/migrations/044_fix_trigger_column_names.sql
-- Fix TWO critical bugs in column-level protection triggers:
-- 1. Wrong column names (zz_club vs zz_current_club etc) — crashed ALL player updates
-- 2. NULL role check — service role (auth.uid()=NULL) was treated as recruiter, reverting all fields
-- RELEVANT FILES: supabase/migrations/038_column_level_protection.sql, supabase/migrations/001_initial_schema.sql

-- ============================================================
-- 1. RECRUITER TRIGGER — fix column names + NULL role passthrough
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_recruiter_column_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  caller_role := user_club_role(auth.uid(), NEW.club_id);

  -- NULL = service role (no auth context) — always allow
  -- Only restrict recruiters — admin/editor/scout pass through
  IF caller_role IS NULL OR caller_role != 'recruiter' THEN
    RETURN NEW;
  END IF;

  -- Recruiter can only change pipeline/contact fields — revert everything else
  NEW.name := OLD.name;
  NEW.dob := OLD.dob;
  NEW.club := OLD.club;
  NEW.position_normalized := OLD.position_normalized;
  NEW.secondary_position := OLD.secondary_position;
  NEW.tertiary_position := OLD.tertiary_position;
  NEW.foot := OLD.foot;
  NEW.shirt_number := OLD.shirt_number;
  NEW.nationality := OLD.nationality;
  NEW.birth_country := OLD.birth_country;
  NEW.height := OLD.height;
  NEW.weight := OLD.weight;
  NEW.department_opinion := OLD.department_opinion;
  NEW.observer := OLD.observer;
  NEW.observer_eval := OLD.observer_eval;
  NEW.observer_decision := OLD.observer_decision;
  NEW.referred_by := OLD.referred_by;
  NEW.referred_by_user_id := OLD.referred_by_user_id;
  NEW.is_shadow_squad := OLD.is_shadow_squad;
  NEW.shadow_position := OLD.shadow_position;
  NEW.shadow_order := OLD.shadow_order;
  NEW.is_real_squad := OLD.is_real_squad;
  NEW.real_squad_position := OLD.real_squad_position;
  NEW.real_order := OLD.real_order;
  NEW.photo_url := OLD.photo_url;
  NEW.club_logo_url := OLD.club_logo_url;
  NEW.fpf_link := OLD.fpf_link;
  NEW.zerozero_link := OLD.zerozero_link;
  NEW.fpf_current_club := OLD.fpf_current_club;
  NEW.fpf_last_checked := OLD.fpf_last_checked;
  NEW.zz_current_club := OLD.zz_current_club;
  NEW.zz_current_team := OLD.zz_current_team;
  NEW.zz_games_season := OLD.zz_games_season;
  NEW.zz_goals_season := OLD.zz_goals_season;
  NEW.zz_photo_url := OLD.zz_photo_url;
  NEW.zz_height := OLD.zz_height;
  NEW.zz_weight := OLD.zz_weight;
  NEW.zz_team_history := OLD.zz_team_history;
  NEW.zz_last_checked := OLD.zz_last_checked;
  NEW.pending_approval := OLD.pending_approval;
  NEW.admin_reviewed := OLD.admin_reviewed;
  NEW.age_group_id := OLD.age_group_id;
  NEW.created_by := OLD.created_by;
  NEW.club_id := OLD.club_id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. SCOUT TRIGGER — fix NULL role passthrough
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_scout_column_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  caller_role := user_club_role(auth.uid(), NEW.club_id);

  -- NULL = service role — always allow
  IF caller_role IS NULL OR caller_role != 'scout' THEN
    RETURN NEW;
  END IF;

  -- Scouts CANNOT change these fields
  NEW.department_opinion := OLD.department_opinion;
  NEW.observer_eval := OLD.observer_eval;
  NEW.observer_decision := OLD.observer_decision;
  NEW.recruitment_status := OLD.recruitment_status;
  NEW.pipeline_order := OLD.pipeline_order;
  NEW.is_shadow_squad := OLD.is_shadow_squad;
  NEW.shadow_position := OLD.shadow_position;
  NEW.shadow_order := OLD.shadow_order;
  NEW.is_real_squad := OLD.is_real_squad;
  NEW.real_squad_position := OLD.real_squad_position;
  NEW.real_order := OLD.real_order;
  NEW.training_date := OLD.training_date;
  NEW.meeting_date := OLD.meeting_date;
  NEW.signing_date := OLD.signing_date;
  NEW.pending_approval := OLD.pending_approval;
  NEW.admin_reviewed := OLD.admin_reviewed;
  NEW.age_group_id := OLD.age_group_id;
  NEW.club_id := OLD.club_id;
  NEW.created_by := OLD.created_by;

  RETURN NEW;
END;
$$;
