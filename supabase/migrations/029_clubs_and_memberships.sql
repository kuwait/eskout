-- supabase/migrations/029_clubs_and_memberships.sql
-- Creates clubs, club_memberships, and club_age_groups tables for multi-tenant support
-- Phase 6A: foundation tables for club isolation

-- Clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  features JSONB DEFAULT '{
    "pipeline": true,
    "calendar": true,
    "shadow_squad": true,
    "scouting_reports": true,
    "scout_submissions": true,
    "export": true,
    "positions_view": true,
    "alerts": true
  }',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Club memberships (replaces role on profiles for club-scoped access)
CREATE TABLE IF NOT EXISTS club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'scout')),
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, club_id)
);

CREATE INDEX idx_club_memberships_user ON club_memberships (user_id);
CREATE INDEX idx_club_memberships_club ON club_memberships (club_id);

-- Club-specific age groups (replaces global age_groups for new clubs)
CREATE TABLE IF NOT EXISTS club_age_groups (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  generation_year INT NOT NULL,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, name, season)
);

CREATE INDEX idx_club_age_groups_club ON club_age_groups (club_id);
