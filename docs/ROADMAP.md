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

### 5B-1. "A Observar" Personal Observation List ✅ DONE
Replaced the pipeline "A Observar" column with a personal per-user observation shortlist.
- [x] Migration 053: `user_observation_list` table (user_id, player_id, note, club_id) with RLS
- [x] Migration 054: Migrate existing `a_observar` players to observation list (via status_history actor), remove `a_observar` from DB constraint
- [x] Server actions (`actions/observation-list.ts`): `getMyObservationList()`, `getAllObservationLists()`, add/remove/update
- [x] New page `/a-observar`: server component + `ObservationListClient.tsx` client view
- [x] Admin secretly sees all users' lists; editor/recruiter see only their own
- [x] Navigation: "A Observar" sub-item under Jogadores in Sidebar + MobileDrawer. Visible to admin, editor, recruiter. Hidden from scout.
- [x] Types & constants cleanup: removed `a_observar` from `RecruitmentStatus` union, pipeline steps, validators

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

## Phase 12 — Player Comparison

Side-by-side comparison of 2-3 players at `/comparar?ids=123,456`. Mobile swipeable cards, desktop columns. Sections: basic data, position, physical, ratings, pipeline, reports, stats.

---

## Phase 13 — Training Feedback

Structured evaluation forms for `vir_treinar` stage. 5 dimensions (technical, tactical, physical, attitude, adaptation) + overall + decision (assinar/repetir/descartar).

---

## Phase 14 — Analytics Dashboard

Advanced metrics at `/analytics`. KPI cards, scout productivity table, pipeline funnel, position coverage matrix, activity over time charts, escalao breakdown.

---

## Phase 15 — Personal Player Lists

User-created lists (bookmarks). `player_lists` + `player_list_items` tables. Bookmark icon on cards/table/profile. `/listas` page with list detail, filters, manual sort.

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
