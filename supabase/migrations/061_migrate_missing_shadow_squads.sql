-- 061_migrate_missing_shadow_squads.sql
-- Fill gaps: create shadow squads for age groups that have legacy is_shadow_squad players
-- but don't yet have a squad in the new squads table. Also migrates their players.
-- Safe to re-run — skips combos that already have a shadow squad.

-- 1. Create missing shadow squads
INSERT INTO squads (club_id, name, squad_type, age_group_id)
SELECT DISTINCT p.club_id, ag.name, 'shadow', p.age_group_id
FROM players p
JOIN age_groups ag ON ag.id = p.age_group_id
WHERE p.is_shadow_squad = true
  AND p.club_id IS NOT NULL
  AND p.age_group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM squads s
    WHERE s.club_id = p.club_id
      AND s.age_group_id = p.age_group_id
      AND s.squad_type = 'shadow'
  )
GROUP BY p.club_id, p.age_group_id, ag.name;

-- 2. Create missing real squads
INSERT INTO squads (club_id, name, squad_type, age_group_id)
SELECT DISTINCT p.club_id, ag.name, 'real', p.age_group_id
FROM players p
JOIN age_groups ag ON ag.id = p.age_group_id
WHERE p.is_real_squad = true
  AND p.club_id IS NOT NULL
  AND p.age_group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM squads s
    WHERE s.club_id = p.club_id
      AND s.age_group_id = p.age_group_id
      AND s.squad_type = 'real'
  )
GROUP BY p.club_id, p.age_group_id, ag.name;

-- 3. Migrate shadow squad players that aren't yet in squad_players
INSERT INTO squad_players (squad_id, player_id, club_id, position, sort_order)
SELECT s.id, p.id, p.club_id,
  COALESCE(p.shadow_position, p.position_normalized, 'GR'),
  p.shadow_order
FROM players p
JOIN squads s ON s.club_id = p.club_id
  AND s.age_group_id = p.age_group_id
  AND s.squad_type = 'shadow'
WHERE p.is_shadow_squad = true
  AND p.club_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM squad_players sp
    WHERE sp.squad_id = s.id AND sp.player_id = p.id
  );

-- 4. Migrate real squad players that aren't yet in squad_players
INSERT INTO squad_players (squad_id, player_id, club_id, position, sort_order)
SELECT s.id, p.id, p.club_id,
  COALESCE(p.real_squad_position, p.position_normalized, 'GR'),
  p.real_order
FROM players p
JOIN squads s ON s.club_id = p.club_id
  AND s.age_group_id = p.age_group_id
  AND s.squad_type = 'real'
WHERE p.is_real_squad = true
  AND p.club_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM squad_players sp
    WHERE sp.squad_id = s.id AND sp.player_id = p.id
  );
