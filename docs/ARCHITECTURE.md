# Technical Architecture — Eskout

Tech stack, project structure, database schema, TypeScript types, and RLS policies.

**See also:** [SOP.md](SOP.md) (overview) · [FEATURES.md](FEATURES.md) (feature specs)

---

## 1. Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js 14+ (App Router) + TypeScript | SSR, API routes, Vercel-native |
| Styling | Tailwind CSS | Mobile-first, utility classes |
| UI Components | shadcn/ui | Accessible, customizable |
| Database | Supabase (PostgreSQL) | Free tier, auth, realtime, RLS |
| Auth | Supabase Auth | Email+password, session management |
| Storage | Supabase Storage | For player photos if needed |
| Deploy | Vercel | Free tier, Next.js integration |
| Scraping | Python (standalone scripts) | Run locally or as cron job |

## 2. Why Supabase?
- Multi-user requires a real database
- Auth included (email + password)
- Row Level Security for role-based permissions
- Free tier: 500MB DB, 1GB storage, 50K auth requests/month
- JavaScript SDK for frontend
- Realtime Broadcast: all mutations propagate instantly to connected clients

---

## 3. Project Structure

```
sikout/
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout (font, providers)
│   │   ├── page.tsx                   # Dashboard
│   │   ├── login/page.tsx
│   │   ├── campo/
│   │   │   ├── page.tsx               # Squad compare view
│   │   │   ├── real/page.tsx          # Real squad panel
│   │   │   └── sombra/page.tsx        # Shadow squad panel
│   │   ├── jogadores/
│   │   │   ├── page.tsx               # Player database
│   │   │   ├── [id]/page.tsx          # Player profile
│   │   │   └── novo/page.tsx          # Add new player
│   │   ├── pipeline/page.tsx
│   │   ├── posicoes/page.tsx
│   │   ├── calendario/page.tsx
│   │   ├── alertas/page.tsx
│   │   ├── mais/page.tsx
│   │   ├── api/image-proxy/route.ts   # CORS bypass
│   │   ├── submeter/page.tsx          # Scout submission
│   │   ├── meus-relatorios/           # Scout reports
│   │   ├── definir-password/page.tsx
│   │   ├── auth/confirm/route.ts
│   │   ├── exportar/page.tsx
│   │   ├── preferencias/page.tsx
│   │   ├── admin/
│   │   │   ├── utilizadores/page.tsx
│   │   │   └── relatorios/           # Report review + scouts + consenso
│   │   └── master/                    # Superadmin panel
│   ├── actions/                       # Server Actions by domain
│   │   ├── auth.ts, players.ts, pipeline.ts, squads.ts
│   │   ├── notes.ts, calendar.ts, users.ts, scout-reports.ts
│   │   ├── scraping.ts, export.ts, evaluations.ts
│   ├── components/
│   │   ├── layout/       # AppShell, Sidebar, MobileDrawer, AgeGroupSelector
│   │   ├── dashboard/    # StatsCards, RecentChanges, PositionCoverage, FlaggedNotesInbox
│   │   ├── squad/        # CampoView, SquadPanelView, FormationView, AddToSquadDialog, etc.
│   │   ├── players/      # PlayersView, PlayerTable, PlayerCard, PlayerProfile, PlayerForm, etc.
│   │   ├── pipeline/     # PipelineView, KanbanBoard, StatusColumn, PipelineCard
│   │   ├── calendar/     # CalendarView, CalendarGrid, CalendarList, CalendarWeek
│   │   ├── positions/    # PositionsView, PositionSection
│   │   ├── reports/      # ReportsView, ReportDetailPanel, ConsensusView
│   │   ├── common/       # StatusBadge, OpinionBadge, PlayerAvatar, MiniPitch, ClubBadge
│   │   └── ui/           # shadcn/ui components
│   ├── lib/
│   │   ├── realtime/     # types, broadcast, RealtimeProvider
│   │   ├── supabase/     # client, server, mappers, queries
│   │   ├── utils/        # positions, exportSquad, dates
│   │   ├── utils.ts, validators.ts, constants.ts
│   │   └── types/index.ts
│   └── hooks/
│       ├── useAgeGroup.tsx, usePageAgeGroup.tsx
│       ├── useRealtimeTable.ts, useRealtimeBadges.ts, usePresence.ts
│       └── useResizableColumns.ts
├── scripts/               # Python scrapers + TS import
├── supabase/migrations/   # 001-028 SQL migrations
├── e2e/                   # Playwright E2E tests
├── data/all_players.json
└── docs/
```

---

## 4. Database Schema (PostgreSQL / Supabase)

```sql
-- ============================================
-- TABLE: profiles (extends Supabase Auth users)
-- ============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'master', 'scout', 'scout_externo')),
  is_superadmin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: age_groups
-- ============================================
CREATE TABLE age_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  generation_year INT NOT NULL,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(generation_year, season)
);

-- ============================================
-- TABLE: players
-- ============================================
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  age_group_id INT REFERENCES age_groups(id),

  -- Basic data
  name TEXT NOT NULL,
  dob DATE,
  club TEXT,
  position_original TEXT,
  position_normalized TEXT
    CHECK (position_normalized IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL','')),
  foot TEXT CHECK (foot IN ('Dir', 'Esq', 'Amb', '')),
  shirt_number TEXT,
  contact TEXT,

  -- Internal classifications
  department_opinion TEXT,
  observer TEXT,
  observer_eval TEXT,
  observer_decision TEXT,
  referred_by TEXT,
  referred_by_user_id UUID REFERENCES profiles(id),
  notes TEXT,

  -- Report labels + links (6 each, from Excel)
  report_label_1 TEXT, report_label_2 TEXT, report_label_3 TEXT,
  report_label_4 TEXT, report_label_5 TEXT, report_label_6 TEXT,
  report_link_1 TEXT, report_link_2 TEXT, report_link_3 TEXT,
  report_link_4 TEXT, report_link_5 TEXT, report_link_6 TEXT,

  -- External links
  fpf_link TEXT, fpf_player_id TEXT,
  zerozero_link TEXT, zerozero_player_id TEXT,

  -- FPF scraped data
  fpf_current_club TEXT, fpf_last_checked TIMESTAMPTZ,

  -- ZeroZero scraped data
  zz_current_club TEXT, zz_current_team TEXT,
  zz_games_season INT, zz_goals_season INT,
  zz_height INT, zz_weight INT,
  zz_photo_url TEXT, zz_team_history JSONB,
  zz_last_checked TIMESTAMPTZ,

  -- Recruitment
  recruitment_status TEXT DEFAULT 'pool'
    CHECK (recruitment_status IN ('pool','shortlist','to_observe','target','in_contact','negotiating','confirmed','assinou','rejected')),
  recruitment_notes TEXT,
  meeting_date DATE,
  signing_date DATE,
  pipeline_order INT DEFAULT 0,

  -- Squad membership
  is_real_squad BOOLEAN DEFAULT FALSE,
  is_shadow_squad BOOLEAN DEFAULT FALSE,
  real_squad_position TEXT
    CHECK (real_squad_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR real_squad_position IS NULL),
  shadow_position TEXT
    CHECK (shadow_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR shadow_position IS NULL),
  squad_order INT DEFAULT 0,

  -- Multi-position
  secondary_position TEXT
    CHECK (secondary_position IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR secondary_position IS NULL),
  tertiary_position TEXT
    CHECK (tertiary_position IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR tertiary_position IS NULL),

  -- Player media
  photo_url TEXT,
  club_logo_url TEXT,

  -- Extended data
  nationality TEXT, birth_country TEXT, height INT, weight INT,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- TABLE: scouting_reports (extracted from PDFs)
-- ============================================
CREATE TABLE scouting_reports (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  gdrive_file_id TEXT NOT NULL,
  gdrive_link TEXT,
  report_number INT,
  pdf_filename TEXT,
  competition TEXT, age_group TEXT, match TEXT,
  match_date DATE, match_result TEXT,
  player_name_report TEXT, shirt_number_report TEXT,
  birth_year_report TEXT, foot_report TEXT,
  team_report TEXT, position_report TEXT,
  physical_profile TEXT, strengths TEXT, weaknesses TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  decision TEXT, analysis TEXT,
  contact_info TEXT, scout_name TEXT,
  raw_text TEXT,
  extraction_status TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'success', 'partial', 'error')),
  extraction_error TEXT, extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: status_history
-- ============================================
CREATE TABLE status_history (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT, new_value TEXT,
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: observation_notes
-- ============================================
CREATE TABLE observation_notes (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  match_context TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'importante', 'urgente')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: calendar_events + M2M
-- ============================================
CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  event_type TEXT NOT NULL CHECK (event_type IN ('observacao', 'jogo', 'reuniao', 'outro')),
  age_group_id INT REFERENCES age_groups(id),
  location TEXT, notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE calendar_event_players (
  event_id INT REFERENCES calendar_events(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, player_id)
);

-- ============================================
-- TABLE: scout_evaluations
-- ============================================
CREATE TABLE scout_evaluations (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (player_id, user_id)
);
```

---

## 5. Indexes

```sql
CREATE INDEX idx_players_age_group ON players(age_group_id);
CREATE INDEX idx_players_position ON players(position_normalized);
CREATE INDEX idx_players_status ON players(recruitment_status);
CREATE INDEX idx_players_shadow ON players(is_shadow_squad);
CREATE INDEX idx_players_real ON players(is_real_squad);
CREATE INDEX idx_players_opinion ON players(department_opinion);
CREATE INDEX idx_reports_player ON scouting_reports(player_id);
CREATE INDEX idx_history_player ON status_history(player_id);
CREATE INDEX idx_notes_player ON observation_notes(player_id);
CREATE INDEX idx_notes_priority ON observation_notes(priority);
CREATE INDEX idx_calendar_date ON calendar_events(event_date);
```

---

## 6. Row Level Security

```sql
-- Everyone authenticated can read
CREATE POLICY "read_all_players" ON players FOR SELECT USING (true);
CREATE POLICY "read_all_reports" ON scouting_reports FOR SELECT USING (true);
CREATE POLICY "read_all_history" ON status_history FOR SELECT USING (true);
CREATE POLICY "read_all_notes" ON observation_notes FOR SELECT USING (true);
CREATE POLICY "read_all_age_groups" ON age_groups FOR SELECT USING (true);
CREATE POLICY "read_own_profile" ON profiles FOR SELECT USING (true);

-- Admin: full write on everything (including DELETE)
CREATE POLICY "admin_full_access_players" ON players FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Master + Scout: can INSERT and UPDATE players, but NOT DELETE
CREATE POLICY "internal_insert_players" ON players FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master', 'scout')));
CREATE POLICY "internal_update_players" ON players FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master', 'scout')));

-- Notes: any authenticated user can insert their own
CREATE POLICY "anyone_insert_notes" ON observation_notes FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Notes: admin can delete any; authors can delete own
CREATE POLICY "admin_delete_notes" ON observation_notes FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "author_delete_own_notes" ON observation_notes FOR DELETE
  USING (auth.uid() = author_id);

-- History: system inserts
CREATE POLICY "system_insert_history" ON status_history FOR INSERT WITH CHECK (true);
```

---

## 7. TypeScript Types

```typescript
type PositionCode = 'GR' | 'DD' | 'DE' | 'DC' | 'MDC' | 'MC' | 'MOC' | 'ED' | 'EE' | 'PL';

type DepartmentOpinion =
  | '1ª Escolha' | '2ª Escolha' | 'Acompanhar'
  | 'Por Observar' | 'Urgente Observar' | 'Sem interesse' | 'Potencial';

type ObserverEval = '' | '2 - Dúvida' | '3 - Bom' | '4 - Muito Bom' | '5 - Excelente';
type ObserverDecision = '' | 'Assinar' | 'Acompanhar' | 'Rever' | 'Sem Interesse';

type RecruitmentStatus =
  | 'pool' | 'shortlist' | 'to_observe' | 'target'
  | 'in_contact' | 'negotiating' | 'confirmed' | 'assinou' | 'rejected';

type NotePriority = 'normal' | 'importante' | 'urgente';
type CalendarEventType = 'observacao' | 'jogo' | 'reuniao' | 'outro';
type UserRole = 'admin' | 'master' | 'scout' | 'scout_externo';

interface Player {
  id: number;
  ageGroupId: number;
  name: string;
  dob: string | null;
  club: string;
  positionOriginal: string;
  positionNormalized: PositionCode | '';
  secondaryPosition: PositionCode | null;
  tertiaryPosition: PositionCode | null;
  foot: 'Dir' | 'Esq' | 'Amb' | '';
  shirtNumber: string;
  contact: string;
  departmentOpinion: DepartmentOpinion | '';
  observer: string;
  observerEval: ObserverEval;
  observerDecision: ObserverDecision;
  referredBy: string;
  notes: string;
  reportLabels: string[];
  reportLinks: string[];
  fpfLink: string;
  fpfPlayerId: string;
  zerozeroLink: string;
  zerozeroPlayerId: string;
  fpfCurrentClub: string | null;
  zzCurrentClub: string | null;
  zzGamesSeason: number | null;
  zzGoalsSeason: number | null;
  zzHeight: number | null;
  zzWeight: number | null;
  zzPhotoUrl: string | null;
  zzTeamHistory: { club: string; season: string; games: number; goals: number }[] | null;
  recruitmentStatus: RecruitmentStatus;
  recruitmentNotes: string;
  meetingDate: string | null;
  signingDate: string | null;
  pipelineOrder: number;
  isRealSquad: boolean;
  isShadowSquad: boolean;
  shadowPosition: PositionCode | null;
  realSquadPosition: string | null;
  squadOrder: number;
  photoUrl: string | null;
  clubLogoUrl: string | null;
  reportAvgRating: number | null;
  reportRatingCount: number;
}
```

See `src/lib/types/index.ts` for full type definitions including `ScoutingReport`, `StatusHistoryEntry`, `ObservationNote`, `CalendarEvent`, `FlaggedNote`.

---

## 8. Migrations

28 SQL migrations in `supabase/migrations/` (001-028). Key ones:

| # | Description |
|---|-------------|
| 001 | Initial schema (profiles, age_groups, players, scouting_reports, status_history, observation_notes) |
| 002 | Seed age groups |
| 011 | Calendar events |
| 016 | Multi-position (secondary_position, tertiary_position) |
| 018 | Note priority |
| 020 | Club logo URL |
| 022-023 | Role system (3 roles + middleware) |
| 027 | real_squad_position column |
| 028 | referred_by_user_id FK |
