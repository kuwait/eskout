# Technical Architecture — Eskout

Tech stack, project structure, database schema, TypeScript types, multi-tenant model, realtime, and RLS policies.

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
│   │   ├── layout.tsx                 # Root layout (font, providers, ThemeProvider)
│   │   ├── loading.tsx                # Root loading skeleton (instant after login redirect)
│   │   ├── page.tsx                   # Dashboard
│   │   ├── login/page.tsx
│   │   ├── escolher-clube/            # Club picker (multi-tenant)
│   │   │   ├── page.tsx
│   │   │   └── ClubPickerList.tsx
│   │   ├── campo/
│   │   │   ├── page.tsx               # Squad compare view
│   │   │   ├── real/page.tsx          # Real squad panel
│   │   │   ├── sombra/page.tsx        # Shadow squad panel
│   │   │   └── [squadId]/page.tsx     # Custom squad view (by squad ID)
│   │   ├── jogadores/
│   │   │   ├── page.tsx               # Player database
│   │   │   ├── [id]/page.tsx          # Player profile
│   │   │   └── novo/page.tsx          # Add new player
│   │   ├── pipeline/page.tsx          # Recruitment pipeline (Kanban/list)
│   │   ├── posicoes/page.tsx          # Position-by-position view
│   │   ├── calendario/page.tsx        # Calendar events
│   │   ├── tarefas/page.tsx           # Personal tasks (auto-generated + manual)
│   │   ├── alertas/page.tsx           # Alerts dashboard
│   │   ├── a-observar/page.tsx        # Redirect → /listas
│   │   ├── listas/                    # Personal player lists (multi-list system)
│   │   │   ├── page.tsx
│   │   │   ├── ListsPageClient.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── ListDetailClient.tsx
│   │   ├── comparar/                  # Player comparison (2-3 players side-by-side)
│   │   │   ├── page.tsx               # Server: fetch bundles + saved comparisons
│   │   │   └── ComparePageClient.tsx   # Client: table/cards + picker + save/load
│   │   ├── mais/page.tsx              # "More" menu page
│   │   ├── submeter/page.tsx          # Scout report submission
│   │   ├── meus-relatorios/           # Scout's own reports
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── meus-jogadores/            # Scout's submitted players
│   │   │   ├── page.tsx
│   │   │   └── MeusJogadoresClient.tsx
│   │   ├── exportar/                  # Export (admin only)
│   │   │   ├── page.tsx
│   │   │   └── ExportForm.tsx
│   │   ├── definicoes/                # Club settings
│   │   │   ├── page.tsx
│   │   │   ├── DefinicoesClient.tsx
│   │   │   └── planteis/page.tsx      # Squad management (admin)
│   │   ├── preferencias/page.tsx      # User preferences (theme, font)
│   │   ├── definir-password/page.tsx  # Set password (invite flow)
│   │   ├── auth/confirm/route.ts      # Auth confirmation callback
│   │   ├── api/
│   │   │   ├── image-proxy/route.ts   # CORS bypass for external images
│   │   │   ├── zz-proxy/route.ts      # ZeroZero scraping proxy
│   │   │   └── export/route.ts        # Export file download
│   │   ├── admin/
│   │   │   ├── utilizadores/          # User management
│   │   │   │   ├── page.tsx
│   │   │   │   └── UserManagement.tsx
│   │   │   ├── pendentes/             # Pending player approvals
│   │   │   │   ├── page.tsx
│   │   │   │   └── PendentesClient.tsx
│   │   │   └── relatorios/            # Report review + scout analytics + consensus
│   │   │       ├── page.tsx
│   │   │       ├── layout.tsx
│   │   │       ├── loading.tsx
│   │   │       ├── [id]/page.tsx
│   │   │       ├── [id]/AdminReportActions.tsx
│   │   │       ├── scouts/page.tsx
│   │   │       └── consenso/page.tsx
│   │   └── master/                    # Superadmin panel
│   │       ├── page.tsx
│   │       ├── layout.tsx
│   │       ├── MasterSidebar.tsx
│   │       ├── clubes/               # Club management
│   │       │   ├── page.tsx
│   │       │   ├── CreateClubForm.tsx
│   │       │   └── [id]/page.tsx
│   │       ├── utilizadores/          # Cross-club user management
│   │       │   ├── page.tsx
│   │       │   └── UsersClient.tsx
│   │       └── online/               # Live online users
│   │           ├── page.tsx
│   │           └── OnlinePageClient.tsx
│   ├── actions/                       # Server Actions by domain
│   │   ├── auth.ts                    # Login, logout, password reset
│   │   ├── players.ts                 # Player CRUD, approval
│   │   ├── pipeline.ts               # Recruitment status changes
│   │   ├── squads.ts                  # Squad management (custom squads, real/shadow, CRUD, reorder)
│   │   ├── notes.ts                   # Observation notes CRUD
│   │   ├── calendar.ts               # Calendar events CRUD
│   │   ├── tasks.ts                   # Personal tasks CRUD
│   │   ├── users.ts                   # User management (admin)
│   │   ├── scout-reports.ts           # Scout report submission/review
│   │   ├── evaluations.ts            # Scout evaluations (1-5 rating)
│   │   ├── scraping.ts               # FPF/ZeroZero data refresh
│   │   ├── scraping/fpf-club-import.ts # FPF club bulk import
│   │   ├── export.ts                  # Export data (Excel, PDF, JSON)
│   │   ├── clubs.ts                   # Club settings, features
│   │   ├── player-lists.ts            # Personal player lists (multi-list system)
│   │   ├── comparisons.ts            # Saved player comparisons CRUD
│   │   ├── player-videos.ts          # Player YouTube video links CRUD
│   │   ├── training-feedback.ts       # Training presence + feedback
│   │   ├── presence.ts               # Heartbeat, online tracking
│   │   ├── impersonate.ts            # Superadmin role impersonation
│   │   └── master-activity.ts        # Superadmin analytics
│   │   └── master-users.ts           # Superadmin user ops
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx           # Server: auth, club context, age groups
│   │   │   ├── AppShellClient.tsx     # Client: sidebar/drawer wrapper, realtime
│   │   │   ├── Sidebar.tsx            # Desktop sidebar navigation
│   │   │   ├── MobileDrawer.tsx       # Hamburger drawer navigation
│   │   │   ├── AgeGroupSelector.tsx   # Persistent age group selector
│   │   │   ├── RoleImpersonator.tsx   # Superadmin role switcher
│   │   │   ├── nav-items.ts           # Navigation item definitions
│   │   │   └── __tests__/nav-items.test.ts
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx         # Counter cards
│   │   │   ├── RecentChanges.tsx      # Recent status changes
│   │   │   ├── PositionCoverage.tsx   # Position coverage overview
│   │   │   └── FlaggedNotesInbox.tsx  # Urgent/important notes inbox
│   │   ├── squad/
│   │   │   ├── CampoView.tsx          # Campo page orchestrator
│   │   │   ├── SquadPanelView.tsx     # Real/shadow squad panel
│   │   │   ├── SquadCompareView.tsx   # Side-by-side comparison
│   │   │   ├── SquadListView.tsx      # List view for squads
│   │   │   ├── FormationView.tsx      # Pitch formation graphic
│   │   │   ├── FormationSlot.tsx      # Individual formation slot
│   │   │   ├── SquadPlayerCard.tsx    # Player card in squad context
│   │   │   ├── PositionGroup.tsx      # Position group with cards
│   │   │   ├── AddToSquadDialog.tsx   # Add player to squad dialog
│   │   │   ├── SquadExportMenu.tsx    # Squad export options
│   │   │   ├── SquadSelector.tsx      # Dropdown to switch between squads
│   │   │   ├── CreateSquadDialog.tsx  # Create custom squad dialog
│   │   │   ├── DeleteSquadConfirmDialog.tsx # Confirm squad deletion
│   │   │   └── SquadManagement.tsx    # Admin squad management page
│   │   ├── players/
│   │   │   ├── PlayersView.tsx        # Player database page
│   │   │   ├── PlayerTable.tsx        # Desktop table view
│   │   │   ├── PlayerCard.tsx         # Mobile card view
│   │   │   ├── PlayerProfile.tsx      # Full player profile
│   │   │   ├── PlayerForm.tsx         # Add/edit player form
│   │   │   ├── PlayerFilters.tsx      # Multi-filter panel
│   │   │   ├── PlayerClubHistory.tsx  # ZeroZero club history
│   │   │   ├── ObservationNotes.tsx   # Notes section in profile
│   │   │   ├── ScoutingReports.tsx    # Reports section in profile
│   │   │   ├── ScoutEvaluations.tsx   # Scout ratings section
│   │   │   ├── TrainingFeedback.tsx   # Training feedback section
│   │   │   ├── StatusHistory.tsx      # Change history log
│   │   │   ├── PlayerAvatar.tsx       # Player photo display (removed — see common/)
│   │   │   └── RefreshPlayerButton.tsx # Re-scrape player data
│   │   ├── pipeline/
│   │   │   ├── PipelineView.tsx       # Pipeline page orchestrator
│   │   │   ├── KanbanBoard.tsx        # Desktop Kanban view
│   │   │   ├── StatusColumn.tsx       # Single Kanban column
│   │   │   ├── StatusList.tsx         # Mobile list view
│   │   │   ├── PipelineCard.tsx       # Pipeline player card
│   │   │   ├── kanban-helpers.ts      # DnD logic helpers
│   │   │   └── __tests__/kanban-helpers.test.ts
│   │   ├── calendar/
│   │   │   ├── CalendarView.tsx       # Calendar page orchestrator
│   │   │   ├── CalendarGrid.tsx       # Month grid view
│   │   │   ├── CalendarList.tsx       # List view
│   │   │   ├── CalendarWeek.tsx       # Week view
│   │   │   ├── CalendarExport.tsx     # Calendar export
│   │   │   ├── EventForm.tsx          # Event create/edit form
│   │   │   ├── EventBadge.tsx         # Event type badge
│   │   │   └── PlayerPickerDialog.tsx # Link player to event
│   │   ├── positions/
│   │   │   ├── PositionsView.tsx      # Position-by-position page
│   │   │   └── PositionSection.tsx    # Single position section
│   │   ├── reports/
│   │   │   ├── ReportsView.tsx        # Admin reports overview
│   │   │   ├── ReportDetailPanel.tsx  # Single report detail
│   │   │   ├── ReportFilters.tsx      # Report filtering
│   │   │   ├── ReportHighlights.tsx   # Highlighted metrics
│   │   │   ├── ReportKpiCards.tsx      # KPI summary cards
│   │   │   ├── ReportPagination.tsx   # Report pagination
│   │   │   ├── ReportTabNav.tsx       # Tab navigation
│   │   │   ├── ReportTagButton.tsx    # Admin tag button
│   │   │   ├── ConsensusView.tsx      # Multi-scout consensus
│   │   │   ├── ScoutStatsPanel.tsx    # Per-scout analytics
│   │   │   └── ActivityHeatmap.tsx    # Submission heatmap
│   │   ├── tasks/
│   │   │   └── TasksView.tsx          # Personal tasks page
│   │   ├── common/
│   │   │   ├── StatusBadge.tsx        # Recruitment status badge
│   │   │   ├── OpinionBadge.tsx       # Department opinion badge
│   │   │   ├── ObservationBadge.tsx   # Observation tier badge
│   │   │   ├── PlayerAvatar.tsx       # Player photo/initials
│   │   │   ├── MiniPitch.tsx          # Mini pitch position graphic
│   │   │   └── ClubBadge.tsx          # Club logo badge
│   │   ├── settings/
│   │   │   └── ThemePicker.tsx        # Theme/font selector
│   │   └── ui/                        # shadcn/ui components
│   │       ├── StaleDataBanner.tsx     # Realtime stale data warning
│   │       └── (standard shadcn components)
│   ├── lib/
│   │   ├── types/index.ts             # All TypeScript types
│   │   ├── constants.ts               # Business constants, age groups
│   │   ├── validators.ts              # Zod schemas
│   │   ├── utils.ts                   # General utilities (cn, etc.)
│   │   ├── theme.tsx                  # Theme provider (10 themes)
│   │   ├── realtime/                  # Supabase Realtime
│   │   │   ├── types.ts               # MutationEvent, PresenceState
│   │   │   ├── broadcast.ts           # Server-side broadcast helpers
│   │   │   ├── RealtimeProvider.tsx   # Client-side channel + presence
│   │   │   └── index.ts              # Re-exports
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser Supabase client
│   │   │   ├── server.ts             # Server-side Supabase client
│   │   │   ├── club-context.ts       # getActiveClub(), club cookie mgmt
│   │   │   ├── mappers.ts            # DB row → domain type mappers
│   │   │   ├── queries.ts            # Database query functions
│   │   │   └── __tests__/mappers.test.ts
│   │   ├── utils/
│   │   │   ├── positions.ts           # Position normalization
│   │   │   ├── dates.ts              # Date formatting helpers
│   │   │   ├── exportSquad.ts        # Squad export logic
│   │   │   └── __tests__/            # Unit tests
│   │   └── zerozero/                  # ZeroZero scraping
│   │       ├── client.ts             # HTTP client
│   │       ├── parser.ts             # HTML parser
│   │       └── helpers.ts            # Parsing helpers
│   └── hooks/
│       ├── useAgeGroup.tsx            # Age group context + provider
│       ├── usePageAgeGroup.tsx        # Per-page age group selection
│       ├── useRealtimeTable.ts        # Subscribe to table mutations
│       ├── useRealtimeBadges.ts       # Live nav badge counts
│       ├── usePresence.ts            # Who's viewing same page
│       ├── usePlayerProfilePopup.tsx  # Quick player preview popup
│       └── useResizableColumns.ts    # Resizable table columns
├── scripts/                           # Python scrapers + TS import
├── supabase/migrations/               # 001-064 SQL migrations
├── e2e/                               # Playwright E2E tests
├── data/all_players.json
└── docs/
```

### Performance Patterns

- **AppShell queries:** All server-side queries (profile, membership, club, age groups, alert counts) run in a single `Promise.all` — 7 parallel queries instead of 3 sequential rounds
- **Login flow:** `login()` server action pre-sets club cookie for single-club users, avoiding middleware redirect loop (was: login → redirect → middleware queries memberships → redirect to set cookie → middleware again)
- **Loading skeletons:** Root `loading.tsx` shows instant skeleton after login redirect. Admin reports page also has `loading.tsx`.
- **Paginated fetches:** Supabase caps `.range()` at 1000 rows. SquadPanelView and PipelineView fetch in 1000-row pages to get all players.
- **Position filter matching:** All player search dialogs (AddToSquadDialog, PlayerPickerDialog, PlayersView, PipelineView) match position filter against primary, secondary, and tertiary positions.

---

## 4. Multi-Tenant Architecture

All data is scoped to a club via `club_id` foreign keys. Users belong to clubs through `club_memberships`.

### Club Context Flow

1. **Middleware** reads `eskout-club-id` cookie on every request
2. If no cookie: auto-selects single club or redirects to `/escolher-clube`
3. **`getActiveClub()`** (`src/lib/supabase/club-context.ts`) verifies membership and returns `ClubContext` with `clubId`, `role`, `club` metadata, `userId`, and `isSuperadmin`
4. Every server action and query calls `getActiveClub()` to scope data

### Key Functions

| Function | Purpose |
|----------|---------|
| `getActiveClub()` | Full context: club + role + user, with DB verification |
| `getActiveClubId()` | Lightweight: reads cookie only, no DB call (for RLS-protected queries) |
| `setActiveClub()` | Sets the club cookie |
| `getUserClubs()` | Lists all clubs the user belongs to (for club picker) |

### Client-Side Club Isolation

RLS policies use `user_club_ids()` which returns **all** clubs a user belongs to. This means client-side Supabase queries (in `'use client'` components) must **explicitly filter by `club_id`** — RLS alone is not sufficient for multi-club users.

**Pattern**: Server pages pass `clubId` (from `getActiveClub()`) as a prop to client components, which add `.eq('club_id', clubId)` to every query.

Components that follow this pattern: `PlayersView`, `PipelineView`, `SquadPanelView`, `SquadManagement`, `PositionsView`, `CampoView`.

### Club Features

Each club has a `features` JSONB column to toggle capabilities:

```typescript
type ClubFeatureKey =
  | 'pipeline' | 'calendar' | 'shadow_squad' | 'scouting_reports'
  | 'scout_submissions' | 'export' | 'positions_view' | 'alerts';
```

### RLS Helper

The `user_club_ids(uid)` SECURITY DEFINER function (migration 032) returns all club IDs for a user without triggering RLS recursion on `club_memberships`. All club-scoped RLS policies use this function.

---

## 5. Roles & Permissions

```typescript
type UserRole = 'admin' | 'editor' | 'scout' | 'recruiter';
```

Roles are **per-club** (stored in `club_memberships.role`), not global. A user can be admin at one club and scout at another.

| Capability | Admin | Editor | Scout | Recruiter |
|-----------|-------|--------|-------|-----------|
| Read all players | Yes | Yes | Limited | Yes (no scouting data) |
| Create players | Yes | Yes | Via submission | Yes |
| Edit players | Yes | Yes | Own created only | Pipeline fields only |
| Delete players | Yes | No | No | No |
| Manage squads | Yes | Yes | No | Yes |
| Manage pipeline | Yes | Yes | No | Yes |
| Submit reports | Yes | Yes | Yes | No |
| Review reports | Yes | Yes (pendentes) | No | No |
| View scouting data | Yes | Yes | Own only | No |
| Export data | Yes | Yes | No | No |
| Manage users | Yes | No | No | No |
| Manage club settings | Yes | No | No | No |

### Column-Level Protection

Migration 038 adds a `BEFORE UPDATE` trigger on `players` that restricts which columns recruiters can modify. Even with direct Supabase API access, recruiters can only update pipeline/contact fields.

### Superadmin

Global flag `profiles.is_superadmin` grants access to `/master` panel (club management, cross-club user ops, online monitoring). Superadmins can impersonate any role via `eskout-role-override` cookie for testing.

---

## 6. Middleware — Route Protection

`src/middleware.ts` handles session refresh, club context, and role-based access.

```
PUBLIC_ROUTES         = /login, /auth/confirm, /definir-password
ADMIN_ONLY_ROUTES     = /admin
SCOUT_ALLOWED_ROUTES  = /meus-relatorios, /submeter, /mais, /preferencias,
                        /jogadores/novo, /meus-jogadores, /jogadores/[id]
RECRUITER_BLOCKED     = /exportar, /meus-relatorios, /submeter, /admin, /alertas
NO_CLUB_ROUTES        = /escolher-clube, /preferencias
SUPERADMIN_ROUTES     = /master
```

**Flow:**
1. Refresh Supabase session
2. Allow social media crawlers through (OG meta tags)
3. Redirect unauthenticated users to `/login`
4. Redirect authenticated users away from `/login`
5. Check superadmin routes → verify `is_superadmin`
6. Check club cookie → auto-select or redirect to picker
7. Check role-based access via `club_memberships.role`

---

## 7. Realtime

Uses **Supabase Realtime Broadcast** (not Postgres Changes) — no DB triggers needed.

### Architecture

```
Server Action (mutation) → broadcastRowMutation() → Supabase Broadcast
                                                          ↓
Client (RealtimeProvider) → event bus → useRealtimeTable callbacks → page refresh
```

### Server Side (`src/lib/realtime/broadcast.ts`)

- `broadcastRowMutation(clubId, table, action, userId, rowId)` — single-row events
- `broadcastBulkMutation(clubId, table, userId, ids)` — bulk operations
- Fire-and-forget: errors logged but never thrown (graceful degradation)
- One channel per club: `club-{clubId}`

### Client Side

| File | Purpose |
|------|---------|
| `RealtimeProvider.tsx` | 1 WebSocket channel per club, event bus, presence, idle disconnect (5 min), visibility API |
| `useRealtimeTable.ts` | Subscribe to specific table mutations with typed callbacks (`onInsert`, `onUpdate`, `onDelete`, `onBulk`, `onAny`) |
| `useRealtimeBadges.ts` | Updates nav badge counts in real-time when relevant tables change |
| `usePresence.ts` | Shows who's viewing/editing the same player profile |
| `StaleDataBanner.tsx` | Warning banner when data may be stale |

### Tables with Realtime

`players`, `observation_notes`, `scouting_reports`, `scout_evaluations`, `status_history`, `calendar_events`, `club_memberships`, `player_added_dismissals`, `user_tasks`, `training_feedback`, `player_lists`, `player_list_items`, `saved_comparisons`, `player_videos`, `squads`, `squad_players`

---

## 8. Theme System

10 themes (8 light + 2 dark), 3 fonts. Stored in `localStorage`, applied via `data-theme` attribute on `<html>`.

### Themes

| ID | Label | Type |
|----|-------|------|
| `eskout` | Eskout | Light (default) |
| `ocean` | Ocean | Light |
| `forest` | Forest | Light |
| `sunset` | Sunset | Light |
| `berry` | Berry | Light |
| `sand` | Sand | Light |
| `rose` | Rose | Light |
| `slate` | Slate | Light |
| `midnight` | Midnight | Dark |
| `carbon` | Carbon | Dark |

### Fonts

Loaded via `next/font/google` in `layout.tsx`:
- **Inter** (default) — `--font-inter`
- **DM Sans** — `--font-dm-sans`
- **Space Grotesk** — `--font-space-grotesk`

Dark themes override hardcoded `bg-white` / `text-neutral-*` classes via CSS.

---

## 9. Database Schema (PostgreSQL / Supabase)

### Core Tables

```sql
-- ============================================
-- TABLE: profiles (extends Supabase Auth users)
-- ============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'scout', 'recruiter')),
  is_superadmin BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  last_page TEXT,
  last_device TEXT,
  session_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: clubs (multi-tenant)
-- ============================================
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  features JSONB DEFAULT '{"pipeline":true,"calendar":true,...}',
  settings JSONB DEFAULT '{}',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: club_memberships (user ↔ club M2M)
-- ============================================
CREATE TABLE club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'scout', 'recruiter')),
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, club_id)
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
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  age_group_id INT REFERENCES age_groups(id),

  -- Basic data
  name TEXT NOT NULL,
  dob DATE,
  club TEXT,
  position_original TEXT,
  position_normalized TEXT
    CHECK (position_normalized IN ('GR','DD','DE','DC','MDC','MD','MC','ME','MOC','ED','EE','AD','AE','SA','PL','')),
  secondary_position TEXT,
  tertiary_position TEXT,
  foot TEXT CHECK (foot IN ('Dir', 'Esq', 'Amb', '')),
  shirt_number TEXT,
  contact TEXT,

  -- Internal classifications
  department_opinion TEXT[],
  observer TEXT,
  observer_eval TEXT,
  observer_decision TEXT,
  referred_by TEXT,
  referred_by_user_id UUID REFERENCES profiles(id),
  notes TEXT,

  -- Report labels + links (6 each, from Excel import)
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

  -- Physical data
  height INT, weight INT,
  nationality TEXT, birth_country TEXT,

  -- Player media
  photo_url TEXT,
  club_logo_url TEXT,

  -- Recruitment pipeline
  recruitment_status TEXT DEFAULT 'por_tratar'
    CHECK (recruitment_status IN (
      'por_tratar','em_contacto','vir_treinar','reuniao_marcada',
      'a_decidir','confirmado','assinou','rejeitado'
    )),
  decision_side TEXT DEFAULT NULL
    CHECK (decision_side IN ('club', 'player')),  -- A Decidir sub-section (migration 058)
  recruitment_notes TEXT,
  contact_assigned_to UUID REFERENCES profiles(id),
  training_date DATE,
  training_escalao TEXT,
  meeting_date DATE,
  meeting_attendees UUID[] DEFAULT '{}',
  signing_date DATE,
  signing_attendees UUID[] DEFAULT '{}',
  pipeline_order INT DEFAULT 0,

  -- Squad membership
  is_real_squad BOOLEAN DEFAULT FALSE,
  is_shadow_squad BOOLEAN DEFAULT FALSE,
  real_squad_position TEXT,
  shadow_position TEXT,
  shadow_order INT DEFAULT 0,
  real_order INT DEFAULT 0,

  -- Approval workflow
  pending_approval BOOLEAN DEFAULT false,
  admin_reviewed BOOLEAN DEFAULT true,
  approved_by UUID,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- TABLE: scouting_reports (PDF extractions + scout submissions)
-- ============================================
CREATE TABLE scouting_reports (
  id SERIAL PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  gdrive_file_id TEXT,              -- nullable for scout submissions
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
  -- Scout submission fields
  author_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'aprovado'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  admin_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: status_history (append-only audit log)
-- ============================================
CREATE TABLE status_history (
  id SERIAL PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
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
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  match_context TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'importante', 'urgente')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: calendar_events
-- ============================================
CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  age_group_id INT REFERENCES age_groups(id),
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  event_type TEXT NOT NULL CHECK (event_type IN ('treino', 'assinatura', 'reuniao', 'observacao', 'outro')),
  location TEXT, notes TEXT,
  assignee_user_id UUID REFERENCES profiles(id),
  assignee_name TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: scout_evaluations (per-scout ratings)
-- ============================================
CREATE TABLE scout_evaluations (
  id SERIAL PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (player_id, user_id)
);

-- ============================================
-- TABLE: user_tasks (personal TODO list)
-- ============================================
CREATE TABLE user_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',  -- manual | pipeline_contact | pipeline_meeting | pipeline_training | pipeline_signing
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE: user_observation_list (personal shortlist)
-- ============================================
CREATE TABLE user_observation_list (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE: training_feedback
-- ============================================
CREATE TABLE training_feedback (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  training_date DATE NOT NULL,
  escalao TEXT,
  presence TEXT NOT NULL DEFAULT 'attended'
    CHECK (presence IN ('attended', 'missed', 'rescheduled')),
  feedback TEXT,
  rating INT CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE: player_added_dismissals (per-user notification dismiss)
-- ============================================
CREATE TABLE player_added_dismissals (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, player_id)
);

-- ============================================
-- TABLE: platform_daily_stats (superadmin analytics)
-- ============================================
CREATE TABLE platform_daily_stats (
  date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  peak_online INTEGER DEFAULT 0
);

-- ============================================
-- TABLE: squads (custom squads per club/age group)
-- ============================================
CREATE TABLE squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  squad_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (squad_type IN ('real', 'shadow', 'custom')),
  age_group_id INT REFERENCES age_groups(id),
  is_default BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, name, age_group_id)
);

-- ============================================
-- TABLE: squad_players (players assigned to squads)
-- ============================================
CREATE TABLE squad_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  position TEXT,
  sort_order INT DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(squad_id, player_id)
);
```

---

## 10. Indexes

```sql
-- Players
CREATE INDEX idx_players_club ON players(club_id);
CREATE INDEX idx_players_age_group ON players(age_group_id);
CREATE INDEX idx_players_position ON players(position_normalized);
CREATE INDEX idx_players_status ON players(recruitment_status);
CREATE INDEX idx_players_shadow ON players(is_shadow_squad);
CREATE INDEX idx_players_real ON players(is_real_squad);
CREATE INDEX idx_players_opinion ON players(department_opinion);

-- Related tables
CREATE INDEX idx_reports_player ON scouting_reports(player_id);
CREATE INDEX idx_history_player ON status_history(player_id);
CREATE INDEX idx_notes_player ON observation_notes(player_id);
CREATE INDEX idx_notes_priority ON observation_notes(priority);
CREATE INDEX idx_calendar_date ON calendar_events(event_date);
CREATE INDEX idx_scouting_reports_admin_tags ON scouting_reports USING GIN(admin_tags);

-- Tasks
CREATE INDEX idx_user_tasks_user ON user_tasks(user_id, completed, created_at DESC);
CREATE INDEX idx_user_tasks_club ON user_tasks(club_id);
CREATE UNIQUE INDEX idx_user_tasks_auto_unique ON user_tasks(user_id, player_id, source)
  WHERE source != 'manual';

-- Observation list
CREATE UNIQUE INDEX idx_observation_list_unique ON user_observation_list(user_id, player_id, club_id);
CREATE INDEX idx_observation_list_user ON user_observation_list(user_id, club_id, created_at DESC);
CREATE INDEX idx_observation_list_club ON user_observation_list(club_id, created_at DESC);

-- Training feedback
CREATE INDEX idx_training_feedback_player ON training_feedback(player_id);
CREATE INDEX idx_training_feedback_club ON training_feedback(club_id);
CREATE INDEX idx_training_feedback_date ON training_feedback(training_date DESC);

-- Dismissals
CREATE INDEX idx_player_dismissals_user ON player_added_dismissals(user_id);

-- Squads
CREATE INDEX idx_squads_club ON squads(club_id);
CREATE INDEX idx_squads_age_group ON squads(club_id, age_group_id);
CREATE INDEX idx_squad_players_squad ON squad_players(squad_id);
CREATE INDEX idx_squad_players_player ON squad_players(player_id);
CREATE INDEX idx_squad_players_club ON squad_players(club_id);
```

---

## 11. Row Level Security

All data tables have RLS enabled. Club-scoped policies use `user_club_ids(auth.uid())` to avoid recursion.

```sql
-- Helper function (SECURITY DEFINER — bypasses RLS)
CREATE FUNCTION public.user_club_ids(uid UUID) RETURNS SETOF UUID
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT club_id FROM club_memberships WHERE user_id = uid $$;

-- ── PLAYERS ──
-- Read: club members see their club's players
CREATE POLICY "Club members read players" ON players FOR SELECT
  USING (club_id IN (SELECT user_club_ids(auth.uid())));

-- Insert: admin/editor create directly; scout/recruiter set pending_approval
CREATE POLICY "Club members insert players" ON players FOR INSERT
  WITH CHECK (club_id IN (SELECT user_club_ids(auth.uid())));

-- Update: admin/editor full access; scout own-created only; recruiter pipeline fields only
CREATE POLICY "Admins/editors update players" ON players FOR UPDATE
  USING (club_id IN (SELECT user_club_ids(auth.uid()))
    AND EXISTS (SELECT 1 FROM club_memberships
      WHERE user_id = auth.uid() AND club_id = players.club_id
      AND role IN ('admin', 'editor', 'recruiter')));

-- Delete: admin only
CREATE POLICY "Admin delete players" ON players FOR DELETE
  USING (EXISTS (SELECT 1 FROM club_memberships
    WHERE user_id = auth.uid() AND club_id = players.club_id AND role = 'admin'));

-- ── OBSERVATION NOTES ──
-- Insert: admin/editor/scout (not recruiter)
-- Delete: admin any, author own

-- ── STATUS HISTORY ──
-- Insert: any club member
-- Delete: admin only (migration 046)

-- ── CLUBS ──
-- Superadmins manage; club members read their own
CREATE POLICY "Members read own club" ON clubs FOR SELECT
  USING (id IN (SELECT user_club_ids(auth.uid())));

-- ── CLUB MEMBERSHIPS ──
-- Club members read all members in their club (migration 048)
-- Admins manage memberships in their club

-- ── SQUADS ──
-- Read: club members see their club's squads
-- Insert/Update/Delete: admin/editor/recruiter (not scout)

-- ── SQUAD_PLAYERS ──
-- Read: club members see squad players in their club
-- Insert/Update/Delete: admin/editor/recruiter (not scout)
```

### Column-Level Trigger

The `enforce_recruiter_column_access()` trigger (migration 038) runs `BEFORE UPDATE` on `players`. If the user's club role is `recruiter`, it reverts any changes to non-pipeline columns (position, squad fields, department opinion, etc.) while allowing updates to: `recruitment_status`, `recruitment_notes`, `contact_assigned_to`, `meeting_date`, `signing_date`, `pipeline_order`, `contact`, `meeting_attendees`, `signing_attendees`, `training_date`, `training_escalao`.

---

## 12. TypeScript Types

```typescript
/* ── Position ── */
type PositionCode = 'GR' | 'DD' | 'DE' | 'DC' | 'MDC' | 'MD' | 'MC' | 'ME' | 'MOC' | 'ED' | 'EE' | 'AD' | 'AE' | 'SA' | 'PL';

/* ── Enums ── */
type DepartmentOpinion =
  | '1ª Escolha' | '2ª Escolha' | 'Acompanhar' | 'Assinar'
  | 'Por Observar' | 'Urgente Observar' | 'Sem interesse' | 'Potencial'
  | 'Ver em treino' | 'Stand-by';

type DecisionSide = 'club' | 'player';

type ObserverEval = '' | '2 - Dúvida' | '3 - Bom' | '4 - Muito Bom' | '5 - Excelente';
type ObserverDecision = '' | 'Assinar' | 'Acompanhar' | 'Rever' | 'Sem Interesse';

type RecruitmentStatus =
  | 'por_tratar' | 'em_contacto' | 'vir_treinar' | 'reuniao_marcada'
  | 'a_decidir' | 'confirmado' | 'assinou' | 'rejeitado';

type UserRole = 'admin' | 'editor' | 'scout' | 'recruiter';
type Foot = 'Dir' | 'Esq' | 'Amb' | '';
type NotePriority = 'normal' | 'importante' | 'urgente';
type CalendarEventType = 'treino' | 'assinatura' | 'reuniao' | 'observacao' | 'outro';
type TaskSource = 'manual' | 'pipeline_contact' | 'pipeline_meeting' | 'pipeline_training' | 'pipeline_signing';
type TrainingPresence = 'attended' | 'missed' | 'rescheduled';
type ObservationTier = 'observado' | 'referenciado' | 'adicionado';
type ClubFeatureKey =
  | 'pipeline' | 'calendar' | 'shadow_squad' | 'scouting_reports'
  | 'scout_submissions' | 'export' | 'positions_view' | 'alerts';

/* ── Core Interfaces ── */
interface Player {
  id: number;
  ageGroupId: number;
  name: string;
  dob: string | null;
  club: string;
  positionNormalized: string;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  foot: Foot;
  departmentOpinion: DepartmentOpinion[];
  recruitmentStatus: RecruitmentStatus | null;
  decisionSide: DecisionSide | null;  // A Decidir sub-section (club/player)
  contactAssignedTo: string | null;
  meetingAttendees: string[];
  signingAttendees: string[];
  trainingEscalao: string | null;
  isRealSquad: boolean;
  isShadowSquad: boolean;
  realSquadPosition: string | null;
  shadowPosition: string | null;
  pendingApproval: boolean;
  adminReviewed: boolean;
  reportAvgRating: number | null;
  reportRatingCount: number;
  observationNotePreviews: string[];
  // ... (50+ fields total, see src/lib/types/index.ts)
}

interface Club {
  id: string; name: string; slug: string; logoUrl: string | null;
  features: Record<string, boolean>;
  settings: Record<string, unknown>;
  limits: Record<string, unknown>;
  isActive: boolean;
}

interface ClubMembership {
  id: string; userId: string; clubId: string;
  role: UserRole; invitedBy: string | null; joinedAt: string;
}

interface ClubContext {
  clubId: string; role: UserRole;
  club: { id: string; name: string; slug: string; logoUrl: string | null;
          features: Record<string, boolean>; settings: Record<string, unknown> };
  userId: string; isSuperadmin: boolean;
}

interface ActionResponse<T = void> {
  success: boolean; data?: T; error?: string;
}

interface UserTask {
  id: number; clubId: number; userId: string; createdBy: string;
  playerId: number | null; title: string; dueDate: string | null;
  completed: boolean; source: TaskSource; pinned: boolean;
}

interface TrainingFeedback {
  id: number; clubId: string; playerId: number; authorId: string;
  trainingDate: string; escalao: string | null;
  presence: TrainingPresence; feedback: string | null;
  rating: number | null;
}
```

```typescript
/* ── Squad Types (custom squads) ── */
type SquadType = 'real' | 'shadow' | 'custom';

interface Squad {
  id: string;
  clubId: string;
  name: string;
  description: string | null;
  squadType: SquadType;
  ageGroupId: number | null;
  isDefault: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
}

interface SquadPlayer {
  id: string;
  squadId: string;
  playerId: number;
  clubId: string;
  position: string | null;
  sortOrder: number;
  addedAt: string;
}
```

See `src/lib/types/index.ts` for full type definitions including `ScoutingReport`, `StatusHistoryEntry`, `ObservationNote`, `CalendarEvent`, `ScoutEvaluation`, `TrainingFeedback`, `UserTask`, `Squad`, `SquadPlayer`, and their corresponding `Row` types (snake_case from Supabase).

---

## 13. Migrations

64 SQL migrations in `supabase/migrations/` (001-064). There is also a `029_030_031_combined.sql` convenience file that bundles three migrations for single-pass execution.

| # | File | Description |
|---|------|-------------|
| 001 | `001_initial_schema.sql` | Initial schema: profiles, age_groups, players, scouting_reports, status_history, observation_notes |
| 002 | `002_seed_age_groups.sql` | Seed age groups (Sub-7 to Sub-19) |
| 003 | `003_fix_rls_recursion.sql` | Fix RLS recursion via SECURITY DEFINER function |
| 004 | `004_squad_ordering.sql` | Squad ordering columns for drag-and-drop |
| 005 | `005_scout_update_players.sql` | Allow scouts to UPDATE players |
| 006 | `006_fix_recruitment_status_constraint.sql` | Fix recruitment_status CHECK constraint values |
| 007 | `007_add_meeting_date.sql` | Add meeting_date column |
| 008 | `008_pipeline_order.sql` | Add pipeline_order for Kanban card ordering |
| 009 | `009_assinou_status_and_signing_date.sql` | Add 'assinou' status + signing_date |
| 010 | `010_photo_url.sql` | Add photo_url column |
| 011 | `011_calendar_events.sql` | Calendar events table + M2M with players |
| 012 | `012_dc_sub_slots.sql` | DC_E/DC_D sub-slots for shadow_position |
| 013 | `013_position_normalized_dc_sub_slots.sql` | DC sub-slots for position_normalized |
| 014 | `014_player_physical_data.sql` | Add height, weight, birth_country, nationality |
| 015 | `015_migrate_notes_to_observation_notes.sql` | Migrate players.notes → observation_notes table |
| 016 | `016_multi_positions.sql` | Add secondary_position, tertiary_position |
| 017 | `017_notes_delete_policy.sql` | RLS policies for note delete/update |
| 018 | `018_note_priority.sql` | Add note priority (normal, importante, urgente) |
| 019 | `019_scout_evaluations.sql` | Per-scout evaluation ratings table |
| 020 | `020_club_logo_url.sql` | Add club_logo_url to players |
| 021 | `021_extra_positions.sql` | Extended positions: MD, ME, AD, AE, SA |
| 022 | `022_editor_role.sql` | Add 'editor' role |
| 023 | `023_soft_delete_users.sql` | Soft delete: active flag on profiles |
| 024 | `024_scout_reports.sql` | Scout submission reports table |
| 025 | `025_scout_reports_extra_fields.sql` | Extra fields for scout reports (FPF/ZZ data) |
| 026 | `026_scouting_reports_nullable_gdrive.sql` | Make gdrive_file_id nullable |
| 027 | `027_real_squad_position.sql` | Add real_squad_position column |
| 028 | `028_referred_by_user.sql` | Add referred_by_user_id FK |
| 029 | `029_clubs_and_memberships.sql` | Multi-tenant: clubs, club_memberships, club_age_groups |
| 030 | `030_add_club_id_to_data_tables.sql` | Add club_id FK to all data tables + is_superadmin |
| 031 | `031_club_rls_policies.sql` | Club-scoped RLS policies (replaces global policies) |
| 032 | `032_fix_club_memberships_rls.sql` | Fix recursive RLS with user_club_ids() function |
| 033 | `033_unify_reports.sql` | Unify scout_reports into scouting_reports table |
| 034 | `034_report_admin_tags.sql` | Add admin_tags array to scouting_reports |
| 035 | `035_recruiter_role.sql` | Add 'recruiter' role to profiles + memberships |
| 036 | `036_player_approval.sql` | Player approval workflow (pending_approval, admin_reviewed) |
| 037 | `037_tighten_rls_policies.sql` | Tighten RLS: restrict UPDATE/DELETE by role |
| 038 | `038_column_level_protection.sql` | Column-level trigger for recruiter field restrictions |
| 039 | `039_fix_profiles_rls.sql` | Fix profiles RLS superadmin recursion |
| 040 | `040_revert_profiles_global_read.sql` | Revert profiles to global read (cross-club needs) |
| 041 | `041_last_seen_at.sql` | Add last_seen_at to profiles for online tracking |
| 042 | `042_presence_tracking.sql` | Extended presence: page, device, session, daily stats |
| 043 | `043_clubs_is_test.sql` | Add is_test flag to clubs |
| 044 | `044_fix_trigger_column_names.sql` | Fix column-level trigger bugs (wrong column names, NULL role) |
| 045 | `045_block_status_history_delete.sql` | Block DELETE on status_history (append-only) |
| 046 | `046_allow_admin_delete_status_history.sql` | Allow admin DELETE on status_history (revert 045) |
| 047 | `047_contact_assigned_to.sql` | Add contact_assigned_to UUID for pipeline contact ownership |
| 048 | `048_club_members_read_all.sql` | Allow all club members to read other members in their club |
| 049 | `049_player_added_dismissals.sql` | Per-user notification dismiss table |
| 050 | `050_tasks_and_pipeline_fields.sql` | Personal tasks table + meeting_attendees + training_escalao |
| 051 | `051_signing_attendees.sql` | Add signing_attendees array to players |
| 052 | `052_training_feedback.sql` | Training feedback table (presence + rating) |
| 053 | `053_user_observation_list.sql` | Personal observation shortlist table |
| 054 | `054_remove_a_observar_status.sql` | Remove 'a_observar' from pipeline, migrate to observation list |
| 055 | `055_player_lists.sql` | Generic player lists system (`player_lists` + `player_list_items`), migrate from `user_observation_list` |
| 056 | `056_saved_comparisons.sql` | Saved player comparisons (`saved_comparisons` with `player_ids int[]`) |
| 057 | `057_player_videos.sql` | Player YouTube video links (`player_videos` with oEmbed metadata) |
| 058 | `058_add_decision_side.sql` | Add `decision_side` column to players (A Decidir club/player split) |
| 059 | `059_custom_squads.sql` | Custom squads: `squads` + `squad_players` tables with RLS |
| 060 | `060_squad_sort_order.sql` | Add `sort_order` to squads for custom ordering |
| 061 | `061_migrate_missing_shadow_squads.sql` | Migrate legacy shadow squad data to `squads`/`squad_players` tables |
| 062 | `062_demo_club.sql` | Add `is_demo` boolean to clubs for demo mode |
| 063 | `063_fix_age_groups_unique_constraint.sql` | Fix age_groups unique constraint to be club-scoped |
| 064 | `064_drop_global_read_policies.sql` | Drop legacy global SELECT policies that bypassed club isolation |
