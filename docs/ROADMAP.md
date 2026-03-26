# Development Roadmap — Eskout

All development phases — completed and planned.

**See also:** [SOP.md](SOP.md) (overview) · [FEATURES.md](FEATURES.md) (feature specs)

---

## Phase 1 — Foundation (MVP) ✅ COMPLETE

- [x] Supabase project (database, auth, RLS)
- [x] Next.js 16 + App Router + TypeScript + Tailwind v4 + shadcn/ui
- [x] Authentication: login, sessions, role-based access
- [x] Age group selector (persistent via localStorage + context)
- [x] JSON import script (`scripts/import_initial_data.ts`)
- [x] Player database: table + card list, search, filters, sorting
- [x] Player profile page
- [x] Color coding by department opinion
- [x] Add new player form
- [x] Deploy to Vercel

**Deliverable:** Working app — login, browse, search, filter, view profiles.

---

## Phase 2 — Planning & Recruitment ✅ COMPLETE

- [x] Real Squad vs Shadow Squad view (PRIMARY page) with compare, real-only, shadow-only
- [x] Shadow/real squad management with manual ordering
- [x] Position view: 10 positions with real/shadow/pool breakdown
- [x] Pipeline: Kanban board, DnD, manual ordering, status history
- [x] Observation notes with priority system
- [x] Dashboard: counters, position coverage, recent changes
- [x] Formation view: pitch graphic, conditional rendering for DnD
- [x] Squad export: PDF, image, text, WhatsApp, print
- [x] DC sub-slots, calendar, player photos, multi-position
- [x] Flagged notes page (`/alertas`), player profile popup/export

**Deliverable:** Full planning workflow.

---

## Phase 3 — External Data & Reports ✅ COMPLETE

- [x] Google Drive API + `extract_reports.py` (PDF parsing)
- [x] Scouting reports display (chronological cards, expandable)
- [x] FPF scraper (current club verification)
- [x] ZeroZero link + scraper + auto-link finder
- [x] Link-first Add Player flow (FPF/ZZ auto-scrape)
- [x] Duplicate detection, delete player, refresh dialog
- [x] Anti-blocking: rotating UAs, realistic headers, delays
- [x] Resizable columns, observation notes column, inline note editing

**Deliverable:** Enriched profiles with reports, club verification, stats.

---

## Phase 4 — Polish & Export ✅ COMPLETE

- [x] Export page: Excel, PDF, JSON with filters
- [x] Role system: admin, editor, scout + middleware + UI guards
- [x] User management: invite, set password, soft delete
- [x] Scout report submission (`/submeter`) + My Reports (`/meus-relatorios`)
- [x] Admin report review: approve/reject + 3 sub-pages
- [x] Dynamic age groups + dynamic season
- [x] Theme system: 10 themes, 3 fonts, localStorage
- [x] PWA: installable, minimal service worker

**Deliverable:** Production-ready application.

---

## Phase 5 — Mobile UX & New Features ✅ COMPLETE

### 5A. Mobile UX Overhaul ✅ DONE
- [x] Hamburger drawer navigation (`MobileDrawer.tsx`)
- [x] Safe-area insets for iPhone notch/dynamic island (`env(safe-area-inset-*)`, `viewport-fit: cover`)
- [x] Full mobile UX audit across all features
- [x] Player profile mobile revamp (MiniPitch, InfoChips, sections)
- [x] Edit mode revamp (foot selector, phone input, referral picker, etc.)
- [x] Scout evaluations popup, OpinionBadge compact, RecruitmentCard
- [x] Admin reports revamp (3 tabs: Relatorios, Scouts, Consenso)
- [x] Scout role mobile UX (`/submeter`, `/meus-relatorios`, `/meus-jogadores` — all mobile-first)
- [x] Mobile pipeline: no DnD (prevents scroll interference), action menu with "Mover para" + "Remover", short names
- [x] Login UX: `useActionState` spinner, pre-set club cookie, `loading.tsx` skeleton
- [x] Position filters: secondary/tertiary matching across all dialogs
- [x] Paginated player fetch in squad dialogs (bypass Supabase 1000-row limit)

### 5B-0. Player Club History & Season Stats ✅ DONE
- [x] Fix ZZ scraper: extract all sub-teams per season, correct goals parsing, extract team/escalao
- [x] Filter out transfers table rows from career parsing
- [x] `PlayerClubHistory.tsx` — career table with escalao pills, current season card, totals
- [x] Responsive layout: mobile below Info Basica, desktop in right column
- [x] Admin can delete status_history entries (migration 046 + server action + UI)

### 5B-1. "Listas" — Personal Player Lists ✅ DONE
Evolved from "A Observar" into a generic multi-list system. Each user can create unlimited named lists with emoji icons. "A Observar" is a system list (auto-created, non-deletable).
- [x] Migration 053: `user_observation_list` table (original, now superseded)
- [x] Migration 054: Migrate existing `a_observar` players to observation list, remove `a_observar` from DB constraint
- [x] Migration 055: `player_lists` + `player_list_items` tables with full RLS, data migration from `user_observation_list`
- [x] Server actions (`actions/player-lists.ts`): `getMyLists()`, `getAllLists()`, `getListById()`, `getListItems()`, `getPickerPlayers()`, `getPlayerListMemberships()`, `createList()`, `renameList()`, `deleteList()`, `addPlayerToList()`, `removePlayerFromList()`, `updatePlayerListMemberships()`, `updateListItemNote()`, `reorderListItems()`, `exportListExcel()` + backward-compat bridge functions
- [x] New page `/listas`: grid of list cards with create/rename/delete dialogs, emoji picker
- [x] New page `/listas/[id]`: list detail with player cards, add/remove/note/export
- [x] AddPlayerDialog: same pattern as AddToSquadDialog (server-fetched players, client-side fuzzyMatch + filters)
- [x] `ListBookmarkDropdown`: popover in player profile header to toggle list memberships with checkboxes + inline "Nova lista" creation
- [x] Admin secretly sees all users' lists in a separate "Todas" panel
- [x] Navigation: "Listas" in Sidebar + MobileDrawer (replaces "A Observar"). Visible to admin, editor, recruiter.
- [x] `/a-observar` redirects to `/listas`
- [x] Realtime: `player_lists` + `player_list_items` in broadcast tables
- [x] Deleted: `ObservationListClient.tsx`, `actions/observation-list.ts`

### 5B-2. Recruiter Role Permissions ✅ DONE
Expanded recruiter role access — unblocked player list and profile, restricted scouting fields.
- [x] Recruiter can access `/jogadores` (player list) — middleware updated
- [x] "Jogadores" nav entry visible to recruiter (pointing to `/`)
- [x] Player profile: recruiter sees observation notes, personal evaluation stars. Hidden: team evaluations, opinion badges, observer/decision/reports, share/print
- [x] Edit mode restricted for recruiter: only name, DOB, club, position, foot, nationality, number, contact, photo, links (no scouting fields)
- [x] Player list: opinion badges and evaluation columns hidden for recruiter
- [x] Middleware: `RECRUITER_BLOCKED_ROUTES` = `/exportar`, `/meus-relatorios`, `/submeter`, `/admin`, `/alertas`

### 5B-3. "Tarefas" — Personal Task Page + Pipeline Enhancements ✅ DONE
Personal TODO workspace per user with auto-generated tasks from pipeline actions.
- [x] Migration 050: `user_tasks` table + `meeting_attendees uuid[]` + `training_escalao text` on players + RLS
- [x] Migration 051: `signing_attendees` field
- [x] Pipeline card UI: attendee picker on reuniao, escalao input + responsible name on vir treinar
- [x] Server actions (`actions/tasks.ts`): `getMyTasks()`, `createTask()`, `completeTask()`, `deleteTask()`, `getMyTaskCount()`, admin oversight (view tasks for any user)
- [x] Page `/tarefas` + `TasksView.tsx`: manual task CRUD with checkbox list, player picker, due dates
- [x] Auto-task creation in pipeline actions (`updateRecruitmentStatus`): contact, meeting, training tasks
- [x] Auto-complete on pipeline state advance
- [x] "Assuntos Importantes" section with flagged notes (read-only links to player profiles)
- [x] Admin oversight: dropdown to view/create tasks for other users
- [x] Nav highlight + badge count (blue badge for pending tasks, red badge for urgent flagged notes)

### 5B. YouTube Media Links ✅ DONE
- [x] `player_videos` table + RLS + Server Action (migration 057)
- [x] YouTube oEmbed extraction (title + thumbnail, no API key)
- [x] "Media" section in player profile (compact rows, opens YouTube directly)
- [x] All roles can add; admin/editor delete any, scout/recruiter delete own
- [x] Max 10 videos per player, duplicate detection, note field

### 5B-4. Pipeline & Opinion Enhancements ✅ DONE
- [x] Split "A Decidir" into Club/Player sub-sections (`decision_side` column, migration 058)
- [x] Desktop: two droppable sub-zones with dashed separator, DnD between them
- [x] Mobile: action menu with "Alterar lado" toggle
- [x] Status history: human-readable decision_side entries, shadow squad generation year
- [x] New department opinions: "Ver em treino" (cyan) and "Stand-by" (slate)
- [x] Fix pipeline horizontal scroll (remove overflow-hidden blocking ScrollArea)
- [x] Fix decision_side race condition — pass side through single `updateRecruitmentStatus` call
- [x] New pipeline column: "Em Stand-by" (slate) between A Decidir and Confirmado — mandatory reason text (`standby_reason`, migration 090)
- [x] Pipeline card notes — inline editable via ⋮ menu, amber badge display, uses existing `recruitment_notes` column

### 5B-5. Custom Squads ✅ DONE
Custom squad system replacing hardcoded real/shadow booleans. Clubs can create unlimited squads per age group.
- [x] Migration 059: `squads` + `squad_players` tables with RLS
- [x] Migration 060: `sort_order` on squads for custom ordering
- [x] Migration 061: Migrate legacy shadow squad data to new tables
- [x] Server actions: `createSquad`, `deleteSquad`, `renameSquad`, `updateSquadDescription`, `addPlayerToSquad`, `removePlayerFromSquad`, `reorderSquadPlayers`, `moveSquadPlayerPosition`, `updateSquadSortOrder`, `getClubSquads`, `getSquadWithPlayers`
- [x] New components: `SquadSelector.tsx`, `CreateSquadDialog.tsx`, `DeleteSquadConfirmDialog.tsx`, `SquadManagement.tsx`
- [x] New routes: `/campo/[squadId]` (custom squad view), `/definicoes/planteis` (admin squad management)
- [x] Validators: `createSquadSchema`, `renameSquadSchema`, `updateSquadDescriptionSchema`, `squadPlayerSchema`
- [x] Renamed "Plantel Real" → "Plantel" across the app
- [x] Realtime: `squads` + `squad_players` in broadcast tables
- [x] Legacy flags (`is_real_squad`, `is_shadow_squad`, `shadow_position`, `real_squad_position`) kept for backward compat

### 5B-6. FPF Club Import Overhaul ✅ DONE
- [x] Multi-club queue: add multiple clubs with different escalões, import all at once
- [x] Queue persisted to localStorage (survives page refresh/HMR)
- [x] Batch processing: 10 players per HTTP request, 5 concurrent server workers
- [x] `withRetry` exponential backoff (3 retries, 3s base + jitter) for FPF resilience
- [x] Real-time dashboard: per-club progress, ETA, speed stats, global progress bar
- [x] Live log panel with semantic colors, auto-scroll near bottom, downloadable as JSON
- [x] Fix Portuguese date parsing (`\w` → accented char class for month names like "março")
- [x] Search error feedback in UI

### 5C. Tactical Formations per Age Group
- [ ] Formation data on `club_age_groups` + slot definitions
- [ ] Formation selector dropdown in squad view
- [ ] Dynamic pitch layout per formation
- [ ] Player re-mapping when formation changes

---

## Phase 6 — Multi-Tenant (Multi-Club Platform) ✅ COMPLETE

Multi-club SaaS with row-level isolation via `club_id`. Single domain `app.eskout.co`.

- [x] **6A:** Schema + RLS + auth context (`club_id` on all tables, `user_club_ids()`, `user_club_role()`)
- [x] **6B:** Superadmin panel (`/master`) — dashboard, clubes, utilizadores, online monitoring
- [x] **6C:** Club picker (`/escolher-clube`) + switcher + club branding (logo, name)
- [x] **6D:** Feature toggles + route gating (middleware, role checks, recruiter role)
- [x] **6E:** Invitation system (user management, set password, soft delete)
- [x] Security hardening: RLS tightening, column-level protection triggers, SSRF prevention
- [x] Presence tracking: heartbeat, online users page, heatmap, activity feed
- [x] Test club filtering (`is_test` flag)

**Deliverable:** Fully multi-tenant platform with superadmin management.

---

## Phase 7 — Internationalization (i18n)

Full UI translation via `next-intl`. Locales: pt (default), en, fr, es.

**Sub-phases:**
- **7A:** Install next-intl, create pt.json, configure
- **7B:** Create en.json
- **7C:** Migrate all components to `t()` calls
- **7D:** Translate domain constants at display time
- **7E:** Language selector + `profiles.locale`
- **7F:** fr.json + es.json
- **7G:** Date/number formatting per locale

---

## Phase 8 — Activity Log

Full audit trail via `activity_log` table. Timeline feed at `/atividade`. Player profile "Historico" timeline.

**Sub-phases:** 8A (table + helper) → 8B (logging in all actions) → 8C (UI page) → 8D (dashboard + profile) → 8E (retention)

---

## Phase 9 — Onboarding Wizard

Guided setup for new clubs at `/configurar`. Steps: Welcome → Escaloes → Team → Import → Features → Done.

---

## Phase 10 — Demo Mode

Read-only demo club with realistic fictional data. `/demo` route, no login required. "Modo Demonstracao" banner.

---

## Phase 11 — Landing Page & Subscriptions

Marketing site at `eskout.co`. Stripe-powered subscriptions (Starter/Pro/Enterprise). Feature gating + limits enforcement.

---

## Phase 12 — Player Comparison ✅ COMPLETE

Side-by-side comparison of 2-3 players at `/comparar?ids=123,456,789`. Mobile swipeable cards, desktop columns. Sections: basic data, position, physical, ratings, pipeline, reports, ZZ stats. Saved comparisons (max 10) with save/load/delete. Inline player picker dialog (same pattern as AddToSquadDialog). Sub-menu item under Jogadores in sidebar/drawer.

---

## Phase 13 — Training Feedback ✅ DONE

Structured evaluation for `vir_treinar` stage with decision, dual rating, physical scales, tagged observations, and external coach feedback.

**Implemented:**
- [x] Decision field: assinar, repetir, duvidas, descartar, sem_decisao
- [x] Physical scales: height, build, speed, intensity, maturation
- [x] Dual rating: ratingPerformance + ratingPotential (replace single rating)
- [x] Tags by category: técnica (10), tático (8), mental (10), adaptação (6)
- [x] Dialog form with segmented rating bars, colored decision buttons, info popovers
- [x] External coach feedback via share link (`feedback_share_tokens` table, 7-day expiry, single use)
- [x] Public page `/feedback/[token]` — player photo, name, club, position, same form
- [x] Public API `/api/feedback/[token]` — GET context, POST submit with Zod validation
- [x] Coach-specific fields: coach_name, coach_feedback, coach_decision, coach_ratings, coach_tags, coach_* scales
- [x] OG meta tags for WhatsApp preview
- [x] Security: UUID tokens, payload size limit, Zod validation, service role client
- [x] Migrations 091-095

---

## Phase 14 — Analytics Dashboard

Advanced metrics at `/analytics`. KPI cards, scout productivity table, pipeline funnel, position coverage matrix, activity over time charts, escalao breakdown.

---

## Phase 15 — Personal Player Lists ✅ COMPLETE (done as Phase 5B-1)

Implemented as part of Phase 5B-1. See "Listas" section above.

---

## Phase 16 — Mapa de Observacoes (Scouting Game Map)

Weekly scouting coordination replacing the Excel "Mapa de Observacoes Semanais". Jornadas (weekly rounds) → jogos (games) → atribuicoes (scout assignments). Scout availability, conflict detection, FPF competition integration, in-app notifications.

**Sub-phases:**
- **16A:** Data model (rounds, games, assignments, availability, competitions, notifications)
- **16B:** Round management CRUD
- **16C:** Scout availability declaration + matrix
- **16D:** Assignments + conflict detection + table view
- **16E:** Scout view (`/meus-jogos`) + report pre-fill
- **16F:** FPF competition integration + auto-tagging
- **16G:** Timeline view + round summary
- **16H:** In-app notification system
- **16I:** FPF match data + player list pre-fill

---

## Phase 17 — Quick Scout Report (Mobile-First Evaluation) ✅ DONE

Mobile-first tap-based evaluation form. All roles can submit. Compact single-row dimension cards with segmented 1-5 bars.

**Implemented:**
- 5 dimension ratings (Técnica, Tática, Físico, Mentalidade, Potencial) — integer 1-5, tap to rate
- Position-aware tags per dimension (outfield vs GR), custom tags with sentiment
- Overall rating (1-5) + recommendation (Assinar / Acompanhar / Sem interesse) — expand on rate
- Observation context (collapsible): position observed (DC split into DC(E)/DC(D)), maturation, morphology (height + build), observed foot, standout level, opponent level, starter/sub + entry minute, minutes observed, conditions (weather/pitch multi-select)
- Match context (collapsible): competition, opponent, date
- Notes (optional free-text)
- QuickReportCard: compact collapsed view + full expanded details with color-coded badges
- Realtime sync, RLS (all roles insert, author/admin delete)
- Migrations: 073, 074, 076, 077, 078

**Not implemented (deprioritized):**
- Offline draft support (localStorage + sync)
- Integration with Mapa de Observações (pre-fill match context)
