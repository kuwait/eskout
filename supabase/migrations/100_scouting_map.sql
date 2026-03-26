-- Migration 100: Scouting Map ("Mapa de Observações")
-- Phase 16A: Weekly scouting coordination — rounds, games, assignments, availability.
-- Replaces the Excel-based weekly coordination workflow.

/* ═══════════════════════════════════════════════════════════════════
   1. scouting_rounds — weekly observation rounds
   ═══════════════════════════════════════════════════════════════════ */

CREATE TABLE scouting_rounds (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id       UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                          -- e.g. "Semana 12 — 22-28 Mar"
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'closed')),
  notes         TEXT DEFAULT '',
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scouting_rounds_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_scouting_rounds_club ON scouting_rounds(club_id);
CREATE INDEX idx_scouting_rounds_dates ON scouting_rounds(club_id, start_date, end_date);
CREATE INDEX idx_scouting_rounds_status ON scouting_rounds(club_id, status);

/* ═══════════════════════════════════════════════════════════════════
   2. scouting_games — games to observe within a round
   ═══════════════════════════════════════════════════════════════════ */

CREATE TABLE scouting_games (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id           UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  round_id          BIGINT NOT NULL REFERENCES scouting_rounds(id) ON DELETE CASCADE,

  -- Optional link to FPF scraped match (NULL = manual game)
  fpf_match_id      INTEGER REFERENCES fpf_matches(id) ON DELETE SET NULL,

  -- Game details: populated from FPF or manually entered.
  -- When fpf_match_id is set, these are copied at creation time (coordinator can override).
  home_team         TEXT NOT NULL,
  away_team         TEXT NOT NULL,
  match_date        DATE NOT NULL,
  match_time        TEXT,                               -- "15:00", TEXT per fpf_matches pattern
  venue             TEXT,
  competition_name  TEXT,                               -- "Torneio X" or FPF competition name
  escalao           TEXT,                               -- "Sub-15", "Sub-17", etc.

  priority          SMALLINT DEFAULT 0,                 -- coordinator can rank games (0 = normal)
  notes             TEXT DEFAULT '',
  created_by        UUID NOT NULL REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scouting_games_round ON scouting_games(round_id);
CREATE INDEX idx_scouting_games_club ON scouting_games(club_id);
CREATE INDEX idx_scouting_games_date ON scouting_games(match_date);
CREATE INDEX idx_scouting_games_fpf ON scouting_games(fpf_match_id) WHERE fpf_match_id IS NOT NULL;

/* ═══════════════════════════════════════════════════════════════════
   3. scout_assignments — assign a scout to a game
   ═══════════════════════════════════════════════════════════════════ */

CREATE TABLE scout_assignments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id       UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  game_id       BIGINT NOT NULL REFERENCES scouting_games(id) ON DELETE CASCADE,
  scout_id      UUID NOT NULL REFERENCES profiles(id),
  assigned_by   UUID NOT NULL REFERENCES profiles(id),
  status        TEXT NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned', 'confirmed', 'completed', 'cancelled')),
  coordinator_notes TEXT DEFAULT '',
  scout_notes       TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, scout_id)
);

CREATE INDEX idx_scout_assignments_game ON scout_assignments(game_id);
CREATE INDEX idx_scout_assignments_scout ON scout_assignments(scout_id);
CREATE INDEX idx_scout_assignments_club ON scout_assignments(club_id);
CREATE INDEX idx_scout_assignments_active ON scout_assignments(status) WHERE status != 'cancelled';

/* ═══════════════════════════════════════════════════════════════════
   4. scout_availability — scout declares when available for a round
   ═══════════════════════════════════════════════════════════════════
   Flexible model:
     'always'     => available entire round (date/period/times ignored)
     'full_day'   => available_date required
     'period'     => available_date + period (morning/afternoon/evening)
     'time_range' => available_date + time_start + time_end
   ═══════════════════════════════════════════════════════════════════ */

CREATE TABLE scout_availability (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id             UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  round_id            BIGINT NOT NULL REFERENCES scouting_rounds(id) ON DELETE CASCADE,
  scout_id            UUID NOT NULL REFERENCES profiles(id),

  availability_type   TEXT NOT NULL
                      CHECK (availability_type IN ('always', 'full_day', 'period', 'time_range')),
  available_date      DATE,
  period              TEXT CHECK (period IS NULL OR period IN ('morning', 'afternoon', 'evening')),
  time_start          TEXT,                              -- "11:00"
  time_end            TEXT,                              -- "12:00"
  notes               TEXT DEFAULT '',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 'always' must NOT have a date; all others MUST have a date
  CONSTRAINT avail_always_no_date CHECK (
    availability_type != 'always' OR available_date IS NULL
  ),
  CONSTRAINT avail_dated_needs_date CHECK (
    availability_type = 'always' OR available_date IS NOT NULL
  ),
  -- period required when type = 'period'
  CONSTRAINT avail_period_check CHECK (
    availability_type != 'period' OR period IS NOT NULL
  ),
  -- time_start + time_end required when type = 'time_range'
  CONSTRAINT avail_time_range_check CHECK (
    availability_type != 'time_range' OR (time_start IS NOT NULL AND time_end IS NOT NULL)
  )
);

CREATE INDEX idx_scout_avail_round ON scout_availability(round_id);
CREATE INDEX idx_scout_avail_scout ON scout_availability(scout_id);
CREATE INDEX idx_scout_avail_club ON scout_availability(club_id);
-- Only one "always" declaration per scout per round
CREATE UNIQUE INDEX idx_scout_avail_always_unique
  ON scout_availability(round_id, scout_id)
  WHERE availability_type = 'always';

/* ═══════════════════════════════════════════════════════════════════
   5. RLS Policies
   ═══════════════════════════════════════════════════════════════════ */

ALTER TABLE scouting_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_availability ENABLE ROW LEVEL SECURITY;

-- ─── scouting_rounds ───
CREATE POLICY "scouting_rounds_select" ON scouting_rounds
  FOR SELECT USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout')
  );
CREATE POLICY "scouting_rounds_insert" ON scouting_rounds
  FOR INSERT WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
CREATE POLICY "scouting_rounds_update" ON scouting_rounds
  FOR UPDATE USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
CREATE POLICY "scouting_rounds_delete" ON scouting_rounds
  FOR DELETE USING (
    user_club_role(auth.uid(), club_id) = 'admin'
  );

-- ─── scouting_games ───
CREATE POLICY "scouting_games_select" ON scouting_games
  FOR SELECT USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout')
  );
CREATE POLICY "scouting_games_insert" ON scouting_games
  FOR INSERT WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
CREATE POLICY "scouting_games_update" ON scouting_games
  FOR UPDATE USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
CREATE POLICY "scouting_games_delete" ON scouting_games
  FOR DELETE USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );

-- ─── scout_assignments ───
-- Scouts see own; admin/editor see all
CREATE POLICY "scout_assignments_select" ON scout_assignments
  FOR SELECT USING (
    scout_id = auth.uid()
    OR user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
CREATE POLICY "scout_assignments_insert" ON scout_assignments
  FOR INSERT WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
-- Scout can update own (confirm/complete); admin/editor can update any
CREATE POLICY "scout_assignments_update" ON scout_assignments
  FOR UPDATE USING (
    scout_id = auth.uid()
    OR user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
CREATE POLICY "scout_assignments_delete" ON scout_assignments
  FOR DELETE USING (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );

-- ─── scout_availability ───
-- Admin/editor see all; scouts see own
CREATE POLICY "scout_avail_select" ON scout_availability
  FOR SELECT USING (
    scout_id = auth.uid()
    OR user_club_role(auth.uid(), club_id) IN ('admin', 'editor')
  );
-- Scouts declare own availability
CREATE POLICY "scout_avail_insert" ON scout_availability
  FOR INSERT WITH CHECK (
    scout_id = auth.uid()
    AND user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'scout')
  );
CREATE POLICY "scout_avail_update" ON scout_availability
  FOR UPDATE USING (scout_id = auth.uid());
CREATE POLICY "scout_avail_delete" ON scout_availability
  FOR DELETE USING (scout_id = auth.uid());
