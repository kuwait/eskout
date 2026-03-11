-- Migration 054: Remove 'a_observar' from recruitment pipeline
-- Players with status 'a_observar' are migrated to the user_observation_list
-- (owned by whoever set the status, from status_history) then reset to 'por_tratar'.
-- Finally, the DB constraint is updated to exclude 'a_observar'.

-- Step 1: Migrate existing a_observar players into user_observation_list
-- Use the most recent status_history entry where new_value = 'a_observar' to find the actor
INSERT INTO user_observation_list (club_id, user_id, player_id, note)
SELECT DISTINCT ON (p.id)
  p.club_id,
  COALESCE(sh.changed_by, (SELECT cm.user_id FROM club_memberships cm WHERE cm.club_id = p.club_id AND cm.role = 'admin' LIMIT 1)),
  p.id,
  'Migrado automaticamente do estado "A Observar" do pipeline'
FROM players p
LEFT JOIN status_history sh
  ON sh.player_id = p.id
  AND sh.field_changed = 'recruitment_status'
  AND sh.new_value = 'a_observar'
WHERE p.recruitment_status = 'a_observar'
ORDER BY p.id, sh.created_at DESC
ON CONFLICT (user_id, player_id, club_id) DO NOTHING;

-- Step 2: Reset all a_observar players to por_tratar
UPDATE players
SET recruitment_status = 'por_tratar'
WHERE recruitment_status = 'a_observar';

-- Step 3: Update the recruitment_status constraint to exclude a_observar
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_recruitment_status_check;
ALTER TABLE players ADD CONSTRAINT players_recruitment_status_check CHECK (
  recruitment_status IS NULL OR recruitment_status IN (
    'por_tratar', 'em_contacto', 'vir_treinar',
    'reuniao_marcada', 'a_decidir', 'confirmado', 'assinou', 'rejeitado'
  )
);
