-- Migration 055: Generic player lists system
-- Evolves user_observation_list into a multi-list architecture
-- Each user can have unlimited named lists; "A Observar" is a system list (auto-created, non-deletable)

-- 1. Create player_lists table
CREATE TABLE IF NOT EXISTS player_lists (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id    uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  emoji      text NOT NULL DEFAULT '📋',
  is_system  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each user can have one system list of each name per club
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_lists_system
  ON player_lists(user_id, club_id, name) WHERE is_system = true;

-- Fast per-user queries (my lists)
CREATE INDEX IF NOT EXISTS idx_player_lists_user
  ON player_lists(user_id, club_id, created_at DESC);

-- Fast admin queries (all lists in a club)
CREATE INDEX IF NOT EXISTS idx_player_lists_club
  ON player_lists(club_id, created_at DESC);

-- 2. Create player_list_items table
CREATE TABLE IF NOT EXISTS player_list_items (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_id    bigint NOT NULL REFERENCES player_lists(id) ON DELETE CASCADE,
  player_id  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  note       text,
  sort_order integer NOT NULL DEFAULT 0,
  added_at   timestamptz NOT NULL DEFAULT now()
);

-- A player can only appear once per list
CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_unique
  ON player_list_items(list_id, player_id);

-- Fast list content queries (items in a list, ordered)
CREATE INDEX IF NOT EXISTS idx_list_items_list
  ON player_list_items(list_id, sort_order);

-- Fast lookup: "which lists contain this player?" (for profile bookmark dropdown)
CREATE INDEX IF NOT EXISTS idx_list_items_player
  ON player_list_items(player_id);

-- 3. RLS for player_lists
ALTER TABLE player_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own lists"
  ON player_lists FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin sees all club lists"
  ON player_lists FOR SELECT
  USING (user_club_role(auth.uid(), club_id) = 'admin');

CREATE POLICY "Members insert own lists"
  ON player_lists FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND club_id IN (SELECT user_club_ids(auth.uid()))
  );

CREATE POLICY "Members update own lists"
  ON player_lists FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Only non-system lists can be deleted
CREATE POLICY "Members delete own non-system lists"
  ON player_lists FOR DELETE
  USING (user_id = auth.uid() AND is_system = false);

-- 4. RLS for player_list_items (access follows list ownership)
ALTER TABLE player_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see items in own lists"
  ON player_list_items FOR SELECT
  USING (list_id IN (SELECT id FROM player_lists WHERE user_id = auth.uid()));

CREATE POLICY "Admin sees items in all club lists"
  ON player_list_items FOR SELECT
  USING (list_id IN (
    SELECT id FROM player_lists
    WHERE user_club_role(auth.uid(), club_id) = 'admin'
  ));

CREATE POLICY "Members insert items in own lists"
  ON player_list_items FOR INSERT
  WITH CHECK (list_id IN (SELECT id FROM player_lists WHERE user_id = auth.uid()));

CREATE POLICY "Members update items in own lists"
  ON player_list_items FOR UPDATE
  USING (list_id IN (SELECT id FROM player_lists WHERE user_id = auth.uid()))
  WITH CHECK (list_id IN (SELECT id FROM player_lists WHERE user_id = auth.uid()));

CREATE POLICY "Members delete items from own lists"
  ON player_list_items FOR DELETE
  USING (list_id IN (SELECT id FROM player_lists WHERE user_id = auth.uid()));

-- 5. Migrate existing data from user_observation_list
-- Create system "A Observar" list for each user who has entries
INSERT INTO player_lists (club_id, user_id, name, emoji, is_system, created_at)
SELECT DISTINCT ON (user_id, club_id) club_id, user_id, 'A Observar', '👁', true, MIN(created_at)
FROM user_observation_list
GROUP BY club_id, user_id;

-- Migrate items into the new system list
INSERT INTO player_list_items (list_id, player_id, note, added_at)
SELECT pl.id, uol.player_id, uol.note, uol.created_at
FROM user_observation_list uol
JOIN player_lists pl
  ON pl.user_id = uol.user_id
  AND pl.club_id = uol.club_id
  AND pl.is_system = true
  AND pl.name = 'A Observar';
