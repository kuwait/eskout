-- Migration 059: Custom Squads
-- Adds squads and squad_players tables for multiple squads per age group.
-- Migrates existing boolean-based squad data into the new structure.
-- All squads are custom — no "default" concept. Starts empty, users create.

/* ───────────── squads table ───────────── */

CREATE TABLE squads (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  description TEXT,
  squad_type TEXT NOT NULL CHECK (squad_type IN ('real', 'shadow')),
  age_group_id INTEGER REFERENCES age_groups(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Shadow squads must have an age group (they are generation-scoped)
  CONSTRAINT shadow_requires_age_group CHECK (squad_type != 'shadow' OR age_group_id IS NOT NULL)
);

/* ───────────── squad_players table ───────────── */

CREATE TABLE squad_players (
  id SERIAL PRIMARY KEY,
  squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id),
  position TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (squad_id, player_id)
);

/* ───────────── Indexes ───────────── */

CREATE INDEX idx_squads_club_type ON squads(club_id, squad_type);
CREATE INDEX idx_squads_club_age ON squads(club_id, age_group_id);
CREATE INDEX idx_squad_players_squad ON squad_players(squad_id);
CREATE INDEX idx_squad_players_player ON squad_players(player_id);
CREATE INDEX idx_squad_players_club ON squad_players(club_id);

/* ───────────── RLS: squads ───────────── */

ALTER TABLE squads ENABLE ROW LEVEL SECURITY;

-- Everyone in the club can read squads
CREATE POLICY "squads_select" ON squads
  FOR SELECT USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- Only admins can create squads
CREATE POLICY "squads_insert" ON squads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = squads.club_id AND role = 'admin'
    )
  );

-- Only admins can update squads (rename, change description)
CREATE POLICY "squads_update" ON squads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = squads.club_id AND role = 'admin'
    )
  );

-- Only admins can delete squads
CREATE POLICY "squads_delete" ON squads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = squads.club_id AND role = 'admin'
    )
  );

/* ───────────── RLS: squad_players ───────────── */

ALTER TABLE squad_players ENABLE ROW LEVEL SECURITY;

-- Everyone in the club can read squad_players
CREATE POLICY "squad_players_select" ON squad_players
  FOR SELECT USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- Everyone except scout can manage squad_players (insert/update/delete)
CREATE POLICY "squad_players_insert" ON squad_players
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = squad_players.club_id AND role IN ('admin', 'editor', 'recruiter')
    )
  );

CREATE POLICY "squad_players_update" ON squad_players
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = squad_players.club_id AND role IN ('admin', 'editor', 'recruiter')
    )
  );

CREATE POLICY "squad_players_delete" ON squad_players
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = squad_players.club_id AND role IN ('admin', 'editor', 'recruiter')
    )
  );

/* ───────────── Data Migration ───────────── */
-- Migrate existing boolean-based squad assignments into custom squads.
-- Creates one squad per (club, age_group, type) combo that has players assigned.

-- 1. Create real squads for age groups that have real squad players
INSERT INTO squads (club_id, name, squad_type, age_group_id)
SELECT DISTINCT p.club_id, 'Plantel ' || ag.name, 'real', p.age_group_id
FROM players p
JOIN age_groups ag ON ag.id = p.age_group_id
WHERE p.is_real_squad = true AND p.club_id IS NOT NULL
GROUP BY p.club_id, p.age_group_id, ag.name;

-- 2. Create shadow squads for age groups that have shadow squad players
INSERT INTO squads (club_id, name, squad_type, age_group_id)
SELECT DISTINCT p.club_id, 'Sombra ' || ag.name, 'shadow', p.age_group_id
FROM players p
JOIN age_groups ag ON ag.id = p.age_group_id
WHERE p.is_shadow_squad = true AND p.club_id IS NOT NULL
GROUP BY p.club_id, p.age_group_id, ag.name;

-- 3. Migrate real squad players
INSERT INTO squad_players (squad_id, player_id, club_id, position, sort_order)
SELECT s.id, p.id, p.club_id, COALESCE(p.real_squad_position, p.position_normalized, 'GR'), p.real_order
FROM players p
JOIN squads s ON s.club_id = p.club_id AND s.age_group_id = p.age_group_id AND s.squad_type = 'real'
WHERE p.is_real_squad = true AND p.club_id IS NOT NULL;

-- 4. Migrate shadow squad players
INSERT INTO squad_players (squad_id, player_id, club_id, position, sort_order)
SELECT s.id, p.id, p.club_id, COALESCE(p.shadow_position, p.position_normalized, 'GR'), p.shadow_order
FROM players p
JOIN squads s ON s.club_id = p.club_id AND s.age_group_id = p.age_group_id AND s.squad_type = 'shadow'
WHERE p.is_shadow_squad = true AND p.club_id IS NOT NULL;
