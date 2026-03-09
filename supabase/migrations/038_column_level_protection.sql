-- supabase/migrations/038_column_level_protection.sql
-- Column-level protection via BEFORE UPDATE trigger
-- Prevents recruiters from modifying fields outside their scope
-- Even with direct Supabase API access, restricted fields are immutable for restricted roles

-- ============================================================
-- 1. RECRUITER: can only update pipeline/contact fields on players
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
  -- Get the caller's role in this club
  caller_role := user_club_role(auth.uid(), NEW.club_id);

  -- Only restrict recruiters — admin/editor/scout pass through
  IF caller_role != 'recruiter' THEN
    RETURN NEW;
  END IF;

  -- Recruiter can only change these fields — revert everything else to OLD values
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
  NEW.fpf_photo_url := OLD.fpf_photo_url;
  NEW.zz_club := OLD.zz_club;
  NEW.zz_team := OLD.zz_team;
  NEW.zz_games := OLD.zz_games;
  NEW.zz_goals := OLD.zz_goals;
  NEW.zz_assists := OLD.zz_assists;
  NEW.zz_photo_url := OLD.zz_photo_url;
  NEW.zz_height := OLD.zz_height;
  NEW.zz_weight := OLD.zz_weight;
  NEW.zz_history := OLD.zz_history;
  NEW.zz_last_checked := OLD.zz_last_checked;
  NEW.pending_approval := OLD.pending_approval;
  NEW.admin_reviewed := OLD.admin_reviewed;
  NEW.age_group_id := OLD.age_group_id;
  NEW.created_by := OLD.created_by;
  NEW.club_id := OLD.club_id;

  -- These fields CAN be changed by recruiter (pipeline + contact):
  -- recruitment_status  (pipeline column changes)
  -- pipeline_order      (drag and drop reorder)
  -- training_date       (schedule training session)
  -- meeting_date        (schedule meeting)
  -- signing_date        (record signing date)
  -- contact             (update player/agent contact info)
  -- notes               (add notes about negotiations)

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_recruiter_columns
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION enforce_recruiter_column_access();

-- ============================================================
-- 2. SCOUT: tighten further — scouts should NOT be able to
--    update scouting intelligence fields even on their own pending players
--    (they can only fix basic info mistakes before approval)
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

  IF caller_role != 'scout' THEN
    RETURN NEW;
  END IF;

  -- Scouts can fix: name, dob, club, position, foot, contact, links, notes, photo
  -- Scouts CANNOT change: department_opinion, observer_eval, observer_decision,
  --   recruitment_status, squad fields, pipeline fields, approval fields
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

CREATE TRIGGER trg_enforce_scout_columns
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION enforce_scout_column_access();

-- ============================================================
-- 3. IMMUTABLE FIELDS — nobody can change these (not even admin)
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- club_id and created_by can NEVER change after insert
  NEW.club_id := OLD.club_id;
  NEW.created_by := OLD.created_by;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_immutable_fields
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION enforce_immutable_fields();

-- ============================================================
-- 4. SAME IMMUTABLE PROTECTION for other tables
-- ============================================================

-- observation_notes: author_id and club_id are immutable
CREATE OR REPLACE FUNCTION public.enforce_note_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.club_id := OLD.club_id;
  NEW.author_id := OLD.author_id;
  NEW.player_id := OLD.player_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_note_immutable
  BEFORE UPDATE ON observation_notes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_note_immutable();

-- status_history: fully immutable (append-only log, no updates)
CREATE POLICY "No updates to status_history"
  ON status_history FOR UPDATE
  USING (false);

-- calendar_events: club_id is immutable
CREATE OR REPLACE FUNCTION public.enforce_calendar_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.club_id := OLD.club_id;
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_calendar_immutable
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_calendar_immutable();
