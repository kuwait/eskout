# FPF Competition Scraping — Implementation Plan

Scrape match data from `resultados.fpf.pt` to build player statistics and detect young players competing above their age group.

**See also:** [SCRAPING.md](SCRAPING.md) (existing scraping docs) · [FEATURES.md](FEATURES.md) (feature specs)

---

## What FPF Exposes (confirmed)

### URL Patterns
| Endpoint | Purpose |
|----------|---------|
| `/Competition` | List all competitions, seasons, associations |
| `/Competition/GetCompetitionsByAssociation?associationId={ID}&seasonId={ID}` | Association competitions |
| `/Competition/Details?competitionId={ID}&seasonId={ID}` | Competition phases/series/fixtures |
| `/Competition/GetClassificationAndMatchesByFixture?fixtureId={ID}` | Jornada matches + standings |
| `/Match/GetMatchInformation?matchId={ID}` | Full match sheet |

### Season ID Formula
`seasonId = 95 + (startYear - 2015)` — e.g. 2025/26 → 105, 2024/25 → 104

Available seasons: 2015/16 (95) through 2025/26 (105)

### Match Sheet Data (per match)
- Starting lineups: 11 per team with shirt numbers + FPF Player IDs (`/Player/Logo/{id}`)
- Substitutes (suplentes): listed with shirt numbers + Player IDs
- Substitutions: player in/out + exact minute
- Goals: player + minute + penalty flag
- Yellow cards: player + minute
- Red cards: player + minute
- Metadata: date, time, venue, competition, referee

### Competition Structure
- Competitions have phases (1ª Fase, 2ª Fase - Apuramento, etc.)
- Each phase has series (Série A, Série B, etc.)
- Each series has ~30 jornadas (fixtureIds)
- Each jornada has ~8 matches (matchIds)
- Typical: ~240 matches per series

### Association IDs (21 districts)
| ID | Name | ID | Name | ID | Name |
|----|------|----|------|----|------|
| 216 | AF Açores | 224 | AF Algarve | 219 | AF Braga |
| 229 | AF Lisboa | 232 | AF Porto | 225 | AF Madeira |
| (+ 15 more) |

### National Youth Competition IDs (2025/26, seasonId=105)
| Competition | ID |
|-------------|-----|
| U-19 I Div | 27882 |
| U-19 II Div | 28132 |
| U-17 I Div | 27962 |
| U-17 II Div | 28141 |
| U-15 I Div | 28015 |
| U-15 II Div | 28230 |

### Match Duration by Escalão
| Escalão | Duration |
|---------|----------|
| Sub-7/Sub-9 | 2x20min = 40min |
| Sub-11 | 2x25min = 50min |
| Sub-13 | 2x30min = 60min |
| Sub-15 | 2x35min = 70min |
| Sub-17 | 2x40min = 80min |
| Sub-19/Sénior | 2x45min = 90min |

---

## Access Model

### Route: `/master/competicoes`

Lives under superadmin panel (`/master`), NOT under `/admin`.

### Permissions
- **Superadmin**: Full access (browse, scrape, view stats)
- **Delegated access**: Superadmin can grant any user `can_view_competitions` permission
  - Grants read-only access to competition stats (no scraping)
  - Works regardless of club role (editor, scout, recruiter)
  - Managed from `/master/competicoes` settings
- **Navigation**: "Competições FPF" appears in Sidebar/MobileDrawer superadmin section, OR in a new section for delegated users

### Implementation
- `profiles.can_view_competitions BOOLEAN DEFAULT false` column
- Middleware: `/master/competicoes` accessible if `is_superadmin` OR `can_view_competitions`
- Server actions: scraping requires `is_superadmin`, reading stats requires either flag
- UI: SuperAdmin manages access from a "Permissões" tab in the competitions section

---

## Database Schema (Migration 065)

### `fpf_competitions` — Tracked competitions

```sql
CREATE TABLE fpf_competitions (
  id SERIAL PRIMARY KEY,
  fpf_competition_id INTEGER NOT NULL,        -- FPF's competitionId
  fpf_season_id INTEGER NOT NULL,             -- FPF's seasonId (e.g. 105)
  name TEXT NOT NULL,                          -- "C.D. Sub-15 I Divisão"
  association_name TEXT,                       -- "AF Porto" (NULL for national)
  association_id INTEGER,                      -- FPF associationId
  class_id INTEGER,                           -- FPF classId → escalão
  escalao TEXT,                               -- "Sub-15"
  season TEXT NOT NULL,                        -- "2025/2026"
  expected_birth_year_start INTEGER,           -- Oldest expected (e.g. 2011)
  expected_birth_year_end INTEGER,             -- Youngest expected (e.g. 2012)
  match_duration_minutes INTEGER DEFAULT 70,   -- Standard duration for this escalão
  total_fixtures INTEGER DEFAULT 0,
  total_matches INTEGER DEFAULT 0,
  scraped_matches INTEGER DEFAULT 0,
  last_scraped_at TIMESTAMPTZ,
  scrape_status TEXT DEFAULT 'pending'
    CHECK (scrape_status IN ('pending', 'scraping', 'complete', 'error')),
  scrape_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fpf_competition_id, fpf_season_id)
);
```

**Note:** No `club_id` — competitions are global (cross-club). All superadmins/delegated users see the same data.

### `fpf_matches` — Individual matches

```sql
CREATE TABLE fpf_matches (
  id SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES fpf_competitions(id) ON DELETE CASCADE,
  fpf_match_id INTEGER NOT NULL UNIQUE,       -- FPF's matchId (globally unique)
  fpf_fixture_id INTEGER NOT NULL,            -- FPF's fixtureId (jornada)
  fixture_name TEXT,                          -- "Jornada 1"
  phase_name TEXT,                            -- "1ª Fase"
  series_name TEXT,                           -- "Série A"
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  match_date DATE,
  match_time TEXT,                            -- "15:00"
  venue TEXT,
  referee TEXT,
  is_forfeit BOOLEAN DEFAULT false,
  has_lineup_data BOOLEAN DEFAULT false,
  scraped_at TIMESTAMPTZ DEFAULT now()
);
```

### `fpf_match_players` — Per-player per-match appearance (core fact table)

```sql
CREATE TABLE fpf_match_players (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES fpf_matches(id) ON DELETE CASCADE,
  fpf_player_id INTEGER,                      -- FPF Player ID (from /Player/Logo/{id})
  player_name TEXT NOT NULL,
  shirt_number INTEGER,
  team_name TEXT NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  subbed_in_minute INTEGER,
  subbed_out_minute INTEGER,
  minutes_played INTEGER,                     -- Calculated from subs + match duration
  goals INTEGER DEFAULT 0,
  penalty_goals INTEGER DEFAULT 0,
  own_goals INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  red_card_minute INTEGER,                    -- For minutes calc (ends at red card)
  eskout_player_id INTEGER REFERENCES players(id),  -- FK to our DB
  UNIQUE (match_id, fpf_player_id, team_name)
);
```

### `fpf_match_events` — Raw event log

```sql
CREATE TABLE fpf_match_events (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES fpf_matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('goal', 'penalty_goal', 'own_goal', 'yellow_card', 'red_card', 'substitution_in', 'substitution_out')),
  minute INTEGER,
  player_name TEXT NOT NULL,
  fpf_player_id INTEGER,
  team_name TEXT NOT NULL,
  related_player_name TEXT,                   -- Sub: the other player
  related_fpf_player_id INTEGER,
  notes TEXT
);
```

### Indexes

```sql
CREATE INDEX idx_fpf_matches_comp ON fpf_matches(competition_id);
CREATE INDEX idx_fpf_matches_date ON fpf_matches(match_date);
CREATE INDEX idx_fpf_mp_match ON fpf_match_players(match_id);
CREATE INDEX idx_fpf_mp_fpf_id ON fpf_match_players(fpf_player_id);
CREATE INDEX idx_fpf_mp_eskout ON fpf_match_players(eskout_player_id) WHERE eskout_player_id IS NOT NULL;
CREATE INDEX idx_fpf_mp_team ON fpf_match_players(team_name);
CREATE INDEX idx_fpf_events_match ON fpf_match_events(match_id);
```

### RLS

```sql
-- No club_id scoping — global data, access controlled by is_superadmin / can_view_competitions
ALTER TABLE fpf_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpf_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpf_match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpf_match_events ENABLE ROW LEVEL SECURITY;

-- Read: superadmin OR can_view_competitions
CREATE POLICY "fpf_comp_read" ON fpf_competitions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_superadmin = true OR can_view_competitions = true))
);
-- Same pattern for all 4 tables

-- Write: superadmin only (scraping)
CREATE POLICY "fpf_comp_write" ON fpf_competitions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
);
-- Same pattern for all 4 tables
```

---

## Server Actions

### File Structure

```
src/actions/scraping/fpf-competitions/
  browse.ts               -- Discover associations + competitions (no DB)
  scrape-competition.ts   -- Orchestrator: scrape full competition
  scrape-match.ts         -- Parse single match HTML
  stats.ts                -- Aggregate stats queries
  playing-up.ts           -- "Playing Up" detection
  link-players.ts         -- Match FPF players → eskout players
  permissions.ts          -- Grant/revoke competition access
```

### Key Actions

| Action | File | Access | Purpose |
|--------|------|--------|---------|
| `getAssociationCompetitions(assocId, seasonId)` | browse.ts | superadmin | Fetch competitions for an association |
| `getNationalCompetitions(seasonId)` | browse.ts | superadmin | Hardcoded national youth IDs |
| `addCompetition(data)` | scrape-competition.ts | superadmin | Track a competition |
| `scrapeCompetition(competitionId)` | scrape-competition.ts | superadmin | Full scrape (incremental) |
| `getCompetitionTopScorers(compId, limit)` | stats.ts | read | Top scorers |
| `getCompetitionMostMinutes(compId, limit)` | stats.ts | read | Most minutes |
| `getCompetitionCards(compId, limit)` | stats.ts | read | Most cards |
| `getCompetitionTeamStats(compId)` | stats.ts | read | Team standings |
| `getPlayingUpPlayers(compId)` | playing-up.ts | read | Players above their age group |
| `getPlayerFpfStats(eskoutPlayerId)` | stats.ts | read | Player stats for profile |
| `linkMatchPlayersToEskout(compId)` | link-players.ts | superadmin | Auto-link FPF → eskout players |
| `grantCompetitionAccess(userId)` | permissions.ts | superadmin | Grant access |
| `revokeCompetitionAccess(userId)` | permissions.ts | superadmin | Revoke access |

### Scraping Flow

1. User picks competition → `addCompetition()` creates DB row
2. User clicks "Scrape" → `scrapeCompetition()`:
   a. Fetch competition page → discover phases/series/fixtures
   b. For each fixture → get match IDs
   c. **Incremental**: skip matchIds already in `fpf_matches`
   d. For each new match → `scrapeMatch()` (parse HTML)
   e. Calculate minutes for each player
   f. Batch insert matches + players + events
   g. After all done → `linkMatchPlayersToEskout()`
3. **Refresh**: same flow, skips existing matches

### Minutes Calculation

```
Starter, not subbed out, no red card → match_duration
Starter, subbed out at X → X
Starter, red card at X → X
Sub enters at X, not subbed out, no red card → match_duration - X
Sub enters at X, subbed out at Y → Y - X
Sub enters at X, red card at Y → Y - X
Suplente, never enters → 0 (not inserted in fpf_match_players)
```

### Rate Limiting
- 3 concurrent match fetches (conservative for resultados.fpf.pt)
- `humanDelay(2000, 4000)` between batches of 5 fixtures
- `withRetry` exponential backoff on failures
- Estimated: ~240 matches per competition × ~3s each = ~12 min per competition

---

## UI

### Route: `/master/competicoes`

Added to MasterSidebar as 5th nav item (icon: `Trophy`).

### Pages

```
src/app/master/competicoes/
  page.tsx                          -- List tracked competitions + add new
  CompetitionBrowser.tsx            -- Browse associations/competitions + add
  CompetitionList.tsx               -- List with scrape status + actions
  ScrapeProgressPanel.tsx           -- Live scraping progress
  PermissionsPanel.tsx              -- Grant/revoke user access
  [id]/
    page.tsx                        -- Competition detail (stats dashboard)
    CompetitionStatsClient.tsx      -- Tab container
    PlayingUpTab.tsx                -- Players above their age group
    TopScorersTab.tsx               -- Goals ranking
    MostMinutesTab.tsx              -- Minutes ranking
    CardsTab.tsx                    -- Disciplinary ranking
    TeamStatsTab.tsx                -- Team standings + stats
    PlayerSearchTab.tsx             -- Search player by name
```

### Stats Dashboard Tabs

| Tab | Content |
|-----|---------|
| **Jogar Acima** | Players with DOB below expected escalão, sorted by minutes. Columns: nome, equipa, DOB, escalão real, anos acima, jogos, titularidades, minutos, golos |
| **Marcadores** | Top scorers. Columns: nome, equipa, golos, penalties, jogos, minutos, min/golo |
| **Minutos** | Most minutes. Columns: nome, equipa, minutos, jogos, titularidades, suplências, média min/jogo |
| **Cartões** | Disciplinary. Columns: nome, equipa, amarelos, vermelhos, jogos |
| **Equipas** | Team stats. Columns: equipa, J, V, E, D, GM, GS, DG, Pts |
| **Pesquisar** | Search any player by name, see all their matches + stats in this competition |

### "Playing Up" Feature (the star feature)

For a competition like "Sub-15 I Divisão Porto" (expected birth year: 2011):
- Find all players whose DOB says they're 2012, 2013, or younger
- These are playing 1-2+ years above their natural escalão
- Rank by total minutes (most minutes = most trusted by coach)
- Highlight if already in our eskout DB
- Show: anos acima (1, 2, 3), golos, titularidades

---

## Player Profile Integration (Phase 5)

### Current: ZeroZero stats
`PlayerClubHistory.tsx` shows career table from ZZ: season, team, escalão, games, goals.

### New: FPF competition stats
When `fpf_match_players.eskout_player_id` matches:
- Show detailed stats per competition: jogos, titularidades, minutos, golos, penalties, amarelos, vermelhos
- Match-by-match log (expandable): date, opponent, score, minutes, events
- This is MORE detailed than ZZ (has minutes, cards, subs)

### Strategy
- Show BOTH sections: "Percurso" (ZZ career overview) + "Estatísticas Competição" (FPF match detail)
- ZZ gives the career overview (past seasons, clubs)
- FPF gives the current season match-level detail
- They complement each other, not replace
- **Current season merge**: In the ZZ "Percurso" table, the current season row gets updated/enriched with FPF data when available (more accurate minutes, goals, games). FPF is the source of truth for the current season; ZZ remains authoritative for past seasons.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Player in multiple competitions | Separate rows per competition, cross-comp aggregation available |
| Player transfers mid-season | Different `team_name` in different matches, stats grouped by `fpf_player_id` |
| Forfeit / W.O. | `is_forfeit = true`, `has_lineup_data = false`, no player rows |
| Match without lineup | `has_lineup_data = false`, only score stored |
| Double yellow → red | Both yellows recorded + red. `yellow_cards = 2, red_cards = 1` |
| Own goals | `event_type = 'own_goal'`, goal counted for opponent |
| Penalties (scored) | `event_type = 'penalty_goal'`, `penalty_goals` incremented |
| Extra time (cup) | Adjust `match_duration_minutes` if detectable, else use standard |
| Same name, different players | Disambiguated by `fpf_player_id` (unique per FPF player) |
| Competition phases | `phase_name` + `series_name` stored per match |
| FPF rate limiting | `withRetry` + exponential backoff + `humanDelay` |
| Competition not yet started | `scraped_matches = 0`, shown as "Sem jogos" |
| Player DOB unknown | Cannot determine "playing up" — excluded from that tab, shown in others |

---

## Implementation Phases

| Phase | Deliverable | Scope |
|-------|-------------|-------|
| **1A** | Migration 065 + types | DB tables, indexes, RLS, types in index.ts |
| **1B** | Constants + validators | Season IDs, escalão mapping, match durations, Zod schemas |
| **2A** | browse.ts | Discover associations + competitions from FPF |
| **2B** | scrape-match.ts | Parse single match HTML → structured data |
| **2C** | scrape-competition.ts | Orchestrator with retry, incremental, progress |
| **2D** | link-players.ts | Auto-link FPF players ↔ eskout players |
| **3A** | stats.ts + playing-up.ts | All aggregation queries |
| **3B** | permissions.ts | Grant/revoke competition access |
| **4A** | MasterSidebar update + route | `/master/competicoes` base page |
| **4B** | Competition browser + list + scrape UI | Add/scrape/track competitions |
| **4C** | Stats dashboard (all tabs) | The full stats experience |
| **4D** | Permissions UI | Manage who can view |
| **5** | Player profile integration | FPF stats section in player profile |
| **6** | Sidebar/drawer for delegated users | Non-superadmin nav entry |
| **7** | Tests | Parser, stats, playing-up, minutes calc |

Each phase delivers independently. Phase 2B (match parser) is the most complex and should be tested thoroughly.

---

## Performance

- ~240 matches per competition × 22 players/match = ~5,280 `fpf_match_players` rows
- 50 tracked competitions → ~260K rows — well within Supabase free tier
- Stats queries use indexed GROUP BY — instant for single competition
- Cross-competition search uses `fpf_player_id` index
- If needed later: materialized view for pre-aggregated stats
