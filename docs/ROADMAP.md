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

## Phase 5 — Mobile UX & New Features ⬚ PLANNED

### 5A. Mobile UX Overhaul ✅ DONE
- [x] Hamburger drawer navigation
- [x] Full mobile UX audit across all features
- [x] Player profile mobile revamp (MiniPitch, InfoChips, sections)
- [x] Edit mode revamp (foot selector, phone input, referral picker, etc.)
- [x] Scout evaluations popup, OpinionBadge compact, RecruitmentCard
- [x] Admin reports revamp (3 tabs: Relatórios, Scouts, Consenso)
- [x] Scout role mobile UX (`/submeter`, `/meus-relatorios`, `/meus-jogadores` — all mobile-first)
- [x] Mobile pipeline: no DnD (prevents scroll interference), ⋮ action menu, short names
- [x] Login UX: `useActionState` spinner, pre-set club cookie, `loading.tsx` skeleton
- [x] Position filters: secondary/tertiary matching across all dialogs
- [x] Paginated player fetch in squad dialogs (bypass Supabase 1000-row limit)

### 5B-0. Player Club History & Season Stats ✅ DONE
- [x] Fix ZZ scraper: extract all sub-teams per season, correct goals parsing, extract team/escalão
- [x] Filter out transfers table rows from career parsing
- [x] `PlayerClubHistory.tsx` — career table with escalão pills, current season card, totals
- [x] Responsive layout: mobile below Info Básica, desktop in right column
- [x] Admin can delete status_history entries (migration 046 + server action + UI)

### 5B-1. "Para Observar" Watchlist + Recruiter Permissions
Personal per-user watchlist replacing the pipeline "A Observar" column. Recruiter role expanded.

**Sub-phases (10 steps):**
1. **Migration 050:** Create `observation_watchlist` table (user_id, player_id, note, club_id). Migrate existing `a_observar` players to watchlist of whoever set them (via status_history). Remove `a_observar` from DB constraint.
2. **Types & constants cleanup:** Remove `a_observar` from `RecruitmentStatus` union, `RECRUITMENT_STATUSES`, Zod validators, `StatusBadge`, `PIPELINE_STEPS`, `ExportForm`, legacy mapper, tests.
3. **Server actions (`actions/watchlist.ts`):** `getMyWatchlist()`, `addToWatchlist(playerId, note?)`, `removeFromWatchlist(playerId)`, `updateWatchlistNote()`. Allowed for admin, editor, recruiter.
4. **New page `/para-observar`:** Server component + `WatchlistView.tsx` client. Player card list + add dialog (same search+filters pattern as pipeline). Realtime.
5. **Navigation:** Add "Para Observar" to Sidebar + MobileDrawer (after Abordagens, before Calendário). Visible to admin, editor, recruiter. Hidden from scout.
6. **Recruiter: unblock `/jogadores`:** Middleware — allow recruiter to access player list. Nav — show "Base de Dados" entry for recruiter pointing to `/jogadores`.
7. **Recruiter: PlayerProfile visibility:** Show Notas de Observação (`!isScout` instead of `!isRestricted`). Show personal evaluation widget (stars). Keep hiding: team evaluations, opinion badges, observer/decision/reports, share/print.
8. **Recruiter: block scouting fields in edit:** `handleSave` condition from `!isScout` to `!isScout && !isRecruiter`. Recruiter edits only: name, DOB, club, position, foot, nationality, number, contact, photo, links.
9. **Watchlist button in player profile:** Toggle button in view mode (bookmark icon). Shows "Na tua lista" if already added. Visible to admin, editor, recruiter.
10. **PlayersView: hide sensitive data for recruiter:** Pass `userRole`, hide opinion badges and evaluation columns in table/cards for recruiter.

### 5B-2. Dynamic Role Permissions (Admin Panel)
Database-driven permission system replacing hardcoded role checks. Club admins toggle permissions per role without deploys.

**Sub-phases:**
1. **Migration:** Add `role_permissions` JSONB column to `clubs` table with sensible defaults per role (admin always full access).
2. **Helper `can(role, permission, ctx)`:** Single function checking `role_permissions[role][key] !== false`. Admin bypasses all checks.
3. **Define permission keys:** `pipeline_view`, `pipeline_edit`, `player_list`, `player_edit_scouting`, `evaluations_personal`, `evaluations_team`, `notes_view`, `notes_edit`, `squads_edit`, `calendar_edit`, `export`, `watchlist`, `reports_view`, `reports_submit`.
4. **Server actions integration:** Replace all `if (role === 'scout')` checks with `can()` calls (~15 action files).
5. **Middleware enforcement:** Check `role_permissions` for route access (not just nav hiding).
6. **UI component gating:** Pass permissions to client, conditionally render sections/buttons.
7. **Admin UI (`/admin/permissoes` or `/definicoes`):** Role × permission matrix with toggle switches. Club admin (not just superadmin) can manage.
8. **Superadmin override:** Master panel can also edit any club's role permissions.

### 5B-3. "Tarefas" — Personal Task Page + Pipeline Enhancements
Personal TODO workspace per user + pipeline data model improvements for meetings and training.

**Pipeline data model (pre-requisite):**
- `meeting_attendees uuid[]` on `players` — who attends the meeting (1 or more users). Auto-cleared when leaving `reuniao_marcada`.
- `training_escalao text` on `players` — free text for which age group the player trains with. Auto-cleared when leaving `vir_treinar`.
- Pipeline card "Vir treinar": show `contact_assigned_to` name (responsible person) + `training_escalao`.
- Pipeline card "Reunião marcada": multi-select user picker for `meeting_attendees`.
- Auto-clear both fields in `updateRecruitmentStatus` (same pattern as date fields).

**Tasks data model:**
```
user_tasks: id, club_id, user_id (owner), created_by, player_id (optional FK),
  title (text), due_date (date?), completed (bool), completed_at (timestamptz?),
  source ('manual'|'pipeline_contact'|'pipeline_meeting'|'pipeline_training'),
  pinned (bool), created_at
  UNIQUE(user_id, player_id, source) — prevents duplicate auto-tasks
```
RLS: each user sees only their own. Admin can see all (for oversight).

**Visibility:**
| Role | Sees |
|---|---|
| Admin | Own tasks + dropdown to view/create tasks for any user |
| Editor | Only own tasks |
| Recruiter | Only own tasks |
| Scout | No access |

**Auto-task creation (in pipeline server actions):**
- Player → `em_contacto` + contact assigned → task "📞 Contactar [name]" for assignee
- Player → `reuniao_marcada` + attendees set → task "🤝 Reunião — [name] · [date]" for each attendee
- Player → `vir_treinar` → task "⚽ Treino — [name] · [date] · [escalão]" for contact_assigned_to
- Player advances to next state → auto-complete tasks from previous state

**Admin-created tasks for others:** Target user can complete but NOT delete. Admin sees completion status.

**Page layout (`/tarefas`):**
- Header: "Tarefas" + count + `[+ Nova]` button
- Section "Por fazer": checkbox list, manual + auto tasks mixed, sorted by due_date then created_at
- Section "Concluídas": completed tasks (persist indefinitely — only purged after X days of user inactivity)
- Section "Assuntos Importantes": flagged notes from /alertas (read-only links to player profiles, not checkboxes)
- Admin: dropdown "Ver tarefas de: [Todos / User1 / User2 / ...]"
- Mobile: tap to check/uncheck, swipe to delete (own manual tasks only)

**New task form:** Title (text) + optional player picker + optional due date. Inline or mini-dialog.

**Navigation:** "Tarefas" in sidebar with visual highlight (subtle background/accent to stand out). Positioned prominently — first or second item. Badge with pending count.

**Sub-phases:**
1. Migration: `meeting_attendees`, `training_escalao` on players + `user_tasks` table + RLS
2. Pipeline card UI: attendee picker on reunião, escalão input + responsible name on vir treinar
3. Server actions (`actions/tasks.ts`): getMyTasks, createTask, completeTask, deleteTask, getTasksForUser (admin)
4. Page `/tarefas` + `TasksView.tsx`: manual task CRUD with checkbox list
5. Auto-task creation in pipeline actions (updateRecruitmentStatus)
6. Auto-complete on pipeline state advance
7. "Assuntos Importantes" section with flagged notes
8. Admin oversight: view/create tasks for other users
9. Nav highlight + badge count

### 5B. YouTube Media Links
- [ ] `player_videos` table + RLS + Server Action
- [ ] YouTube oEmbed extraction (title + thumbnail)
- [ ] "Media" section in player profile (cards + inline embed)

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

Full audit trail via `activity_log` table. Timeline feed at `/atividade`. Player profile "Histórico" timeline.

**Sub-phases:** 8A (table + helper) → 8B (logging in all actions) → 8C (UI page) → 8D (dashboard + profile) → 8E (retention)

---

## Phase 9 — Onboarding Wizard

Guided setup for new clubs at `/configurar`. Steps: Welcome → Escalões → Team → Import → Features → Done.

---

## Phase 10 — Demo Mode

Read-only demo club with realistic fictional data. `/demo` route, no login required. "Modo Demonstração" banner.

---

## Phase 11 — Landing Page & Subscriptions

Marketing site at `eskout.co`. Stripe-powered subscriptions (Starter/Pro/Enterprise). Feature gating + limits enforcement.

---

## Phase 12 — Player Comparison

Side-by-side comparison of 2-3 players at `/comparar?ids=123,456`. Mobile swipeable cards, desktop columns. Sections: basic data, position, physical, ratings, pipeline, reports, stats.

---

## Phase 13 — Training Feedback

Structured evaluation forms for `vir_treinar` stage. 5 dimensions (technical, tactical, physical, attitude, adaptation) + overall + decision (assinar/repetir/descartar).

---

## Phase 14 — Analytics Dashboard

Advanced metrics at `/analytics`. KPI cards, scout productivity table, pipeline funnel, position coverage matrix, activity over time charts, escalão breakdown.

---

## Phase 15 — Personal Player Lists

User-created lists (bookmarks). `player_lists` + `player_list_items` tables. Bookmark icon on cards/table/profile. `/listas` page with list detail, filters, manual sort.

---

## Phase 16 — Mapa de Observações (Scouting Game Map)

Weekly scouting coordination replacing the Excel "Mapa de Observações Semanais". Jornadas (weekly rounds) → jogos (games) → atribuições (scout assignments). Scout availability, conflict detection, FPF competition integration, in-app notifications.

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
