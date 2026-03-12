# SOP — Eskout

**Version:** 9.0 | **Date:** March 11, 2026 | **UI Language:** Portuguese (PT-PT)

> **This is the hub document.** Detailed specs are split across focused files — see the Index below.

---

## Index

| Document | Content |
|----------|---------|
| [SOP.md](SOP.md) | This file — overview, product decisions, implementation rules |
| [DATA.md](DATA.md) | Data sources, JSON structure, Excel mapping, position normalization |
| [FEATURES.md](FEATURES.md) | Feature specs (all sections 4.x) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Tech stack, project structure, DB schema, types, RLS |
| [SCRAPING.md](SCRAPING.md) | FPF, ZeroZero, report extraction, in-app scraping, anti-blocking |
| [UX.md](UX.md) | Design principles, navigation, workflows |
| [ROADMAP.md](ROADMAP.md) | Development phases (1-4 done, 5-16 planned) |

---

## 1. Project Overview

### 1.1. What This Is
A mobile-first, multi-tenant web application for football club scouting departments to manage youth squad recruitment across all age groups. The core workflow is: scout players → evaluate → build a shadow squad of the best candidates per position → compare with the real squad → decide who to approach → track recruitment pipeline.

### 1.2. Problem Statement
Scouting departments currently use Google Sheets spreadsheets with ~2000 scouted players across all age groups. This is hard to navigate, has no visual position mapping, no recruitment pipeline, and clubs may be outdated (players transfer frequently at youth level). Scouting reports are PDFs scattered across Google Drive with no structured data extraction.

### 1.3. Core Concepts

**Real Squad (Plantel Real):** Players currently signed to the club for each age group. This is the actual team roster.

**Shadow Squad (Plantel Sombra):** The best external candidates identified by the scouting department, organized by position. These are players the club wants to monitor or approach. This is the PRIMARY planning tool — it represents "the best available players in the market for each position."

**The key view is comparing Real Squad vs Shadow Squad:**
- Which positions are already strong in the real squad
- Which positions need reinforcement
- Who from the shadow squad should be approached to fill gaps
- Who is realistically signable based on their current club

### 1.4. Positions

The app uses two tiers of positions:

**Squad positions (10)** — used in Real Squad, Shadow Squad, and Formation views:

| Code | Portuguese Name | English |
|------|----------------|---------|
| GR | Guarda-Redes | Goalkeeper |
| DD | Defesa Direito / Lateral Direito | Right Back |
| DE | Defesa Esquerdo / Lateral Esquerdo | Left Back |
| DC | Defesa Central | Centre Back |
| MDC | Médio Defensivo Centro | Defensive Midfielder |
| MC | Médio Centro | Central Midfielder |
| MOC | Médio Ofensivo Centro | Attacking Midfielder |
| ED | Extremo Direito | Right Winger |
| EE | Extremo Esquerdo | Left Winger |
| PL | Ponta de Lança | Striker |

**Extended positions (5)** — available for player profiles and MiniPitch only, NOT in squad/formation views:

| Code | Portuguese Name | English |
|------|----------------|---------|
| MD | Médio Direito | Right Midfielder |
| ME | Médio Esquerdo | Left Midfielder |
| AD | Ala Direito | Right Wing-Back |
| AE | Ala Esquerdo | Left Wing-Back |
| SA | Segundo Avançado | Second Striker |

**There is NO "EXT" (generic winger) position.** If the original data has "Extremo" without a side, it must be manually classified as ED or EE by the admin, or left blank for later assignment.

### 1.5. Users & Roles

#### Club Roles

Roles are **per-club**, stored in `club_memberships.role`. A user can have different roles at different clubs.

Four roles with progressively restricted access:

| Role | Who | Access |
|------|-----|--------|
| **Admin** | Head of scouting, system owner | Full access. User management, club settings, import, export, delete players, all CRUD. Can see all users' player lists and tasks. |
| **Editor** | Formation coordinators, senior scouts | Everything except admin area: can view/edit all data, manage squads, pipeline, calendar. Cannot manage users, import, export, or delete players. Can access `/admin/pendentes` to review scout submissions. |
| **Scout** | External/freelance scouts | Can only access dedicated submission page (`/submeter`), own reports (`/meus-relatorios`), own submitted players (`/meus-jogadores`), individual player profiles, and preferences. Cannot view the database, squads, pipeline, or any other page. |
| **Recruiter** (Recrutador) | Club staff handling negotiations/signing | Can see plantéis (real + shadow), pipeline, calendário, posições, player list, and player profiles. **Cannot** see scouting intelligence (ratings, observations, notes, history, recruitment details in profiles), alerts, or export. Cannot submit reports. Redirected to `/campo/real` as home. |

#### Superadmin

Superadmin is a **boolean flag** on the `profiles` table (`is_superadmin = true`), completely separate from club roles. A superadmin can also be an admin/editor/etc. at specific clubs.

Superadmin capabilities:
- Access to `/master` panel for cross-club management (clubs, users, stats)
- Can manage all clubs, users, and feature toggles
- Can impersonate any role via cookie-based override (`eskout-role-override`) for testing (4h TTL)
- Can read all profiles globally (bypasses club-scoped profile privacy)
- `/master` routes are protected — non-superadmins are redirected to `/`

There are **no** `master` or `scout_externo` roles. These were legacy role names that have been replaced.

### 1.6. Multi-Tenancy

The app is **multi-tenant**. All data is scoped to a club via `club_id` foreign key.

**Key tables:**
- `clubs` — one row per club. Has `features` (JSONB), `settings` (JSONB), `limits` (JSONB), `is_active`, `is_test` columns.
- `club_memberships` — links users to clubs with a role. A user can belong to **multiple clubs**.
- `club_age_groups` — club-specific age groups (replaces global `age_groups` for new clubs).

**Data tables with `club_id`:** `players`, `age_groups`, `scouting_reports`, `observation_notes`, `status_history`, `calendar_events`, `scout_evaluations`, `scout_reports`, `user_tasks`, `player_lists`, `player_list_items`, `training_feedback`.

**Club switching:** Users with multiple club memberships select their active club at `/escolher-clube`. The active club ID is stored in an `httpOnly` cookie (`eskout-club-id`). If a user has only one club, it is auto-selected.

**Feature toggles:** Each club can enable/disable features via the `features` JSONB column:

| Feature Key | Default | Controls |
|-------------|---------|----------|
| `pipeline` | `true` | Recruitment pipeline page |
| `calendar` | `true` | Scouting calendar |
| `shadow_squad` | `true` | Shadow squad management |
| `scouting_reports` | `true` | PDF report extraction display |
| `scout_submissions` | `true` | Scout submission workflow |
| `export` | `true` | Export functionality |
| `positions_view` | `true` | Position-by-position page |
| `alerts` | `true` | Flagged notes / alerts page |

**RLS isolation:** All RLS policies are club-scoped — users can only read/write data in clubs they belong to (via `club_memberships`). Superadmins bypass club restrictions on the `clubs` table.

### 1.7. Hosting & Stack
- **Frontend:** Vercel (free tier) — Next.js
- **Backend/DB:** Supabase (free tier) — PostgreSQL + Auth + Realtime + Storage

---

## 2. Product Decisions

| Decision | Choice |
|----------|--------|
| Formation | **Dynamic** — no fixed formation. Field view groups by position categories. Formation view available as visual overlay. |
| Squad size | **Dynamic** — no limit. DC position supports sub-slots (DC_E, DC_D) for finer granularity. |
| Multi-age-group | **Yes** — all age groups supported |
| Dynamic age groups | **Yes** — computed from current date, season starts July 1. `Sub-N` where birth year = `seasonEndYear - N`. Sénior for players above Sub-19. No hardcoded season tables. |
| Multi-user | **Yes** — 4 club roles: Admin, Editor, Scout, Recruiter (+ Superadmin boolean) |
| Multi-tenant | **Yes** — `club_id` on all data tables. Users can belong to multiple clubs via `club_memberships`. Club switching via `/escolher-clube`. |
| Feature toggles | **Yes** — JSONB `features` column on `clubs` table. Per-club enable/disable of pipeline, calendar, shadow squad, reports, export, etc. |
| Authentication | Email + password per user |
| Profiles | Admin (full access) / Editor (edit, not delete/manage users) / Scout (submit + own reports only) / Recruiter (squads/pipeline, no scouting data) |
| Add new players | Directly in the app |
| Change history | Yes — every status change logged with date, author, old→new |
| Export | PDF, image, text, WhatsApp-formatted, and print for squads. Excel/PDF/JSON export at `/exportar`. |
| Mobile | **Mobile-first** — scouts use phone at the field |
| UI Language | **Portuguese (PT-PT)** |
| Shadow squad | Pre-loaded for gen 2012, editable. Other age groups start empty. |
| Club difficulty | Not needed — scouts know |
| ZeroZero link | Manual entry by admin |
| FPF link | Auto-imported from Excel |
| Calendar | **Yes** — scouting calendar for scheduling observations, matches, and meetings. Event types: `treino`, `assinatura`, `reuniao`, `observacao`, `outro` (lembrete). |
| Player photos | **Yes** — photo URL field on player profile, displayed as avatar throughout the app. |
| Signing tracking | **Yes** — "Assinou" recruitment status + signing date field for confirmed players. |
| Meeting date | **Yes** — tracked on player profile for recruitment pipeline. |
| Pipeline ordering | **Yes** — manual ordering within pipeline status columns. |
| Squad ordering | **Yes** — manual ordering within position groups in squads. |
| Multi-position | **Yes** — players can have primary, secondary, and tertiary positions. Displayed with color-coded dots (green/yellow/orange) on profile and mini pitch. |
| Note priorities | **Yes** — observation notes can be normal, importante, or urgente. Urgente/importante notes appear in a dedicated flagged notes page (`/alertas`). |
| Note deletion | **Yes** — admins can delete any note; authors can delete their own notes. Confirmation dialog before delete. |
| Profile export | **Yes** — player profile can be exported as PNG image or printed. Cross-origin images resolved via server-side proxy. |
| Flagged notes page | **Yes** — `/alertas` page showing all important/urgent notes with player photo, priority styling, and dismissal. Navigation badges show counts. |
| Observation tier | **Yes** — computed field classifying players as Observado (has reports), Referenciado (has referred_by), or Adicionado (neither). Icon badge on cards/table/profile + filter dropdown. |
| Hybrid rating | **Yes** — primary rating = scouting report average (decimal) when available, else manual observer_eval (integer). Profile shows both when they coexist. |
| Weekly calendar | **Yes** — calendar supports month and week views with client-side toggle, popover picker, and smart navigation. |
| Themes | **Yes** — 10 themes (8 light + 2 dark): eskout, ocean, forest, sunset, berry, sand, rose, slate, midnight, carbon. 3 fonts: Inter (default), DM Sans, Space Grotesk. Stored in localStorage per device. |
| PWA | **Yes** — installable via minimal service worker. No offline mode, no push notifications. |
| Player lists | **Yes** — personal player lists per user (`/listas`). Each user manages multiple named lists with emoji icons. "A Observar" is a system list (auto-created, non-deletable). Admins can secretly see all users' lists. Stored in `player_lists` + `player_list_items` tables. |
| Tasks | **Yes** — personal tasks page (`/tarefas`). Manual tasks + auto-generated tasks from pipeline events (contact assignments, meetings, training sessions, signings). Tasks can be pinned, completed, and deleted. Admins can see all club tasks and assign tasks to other users. |
| Training feedback | **Yes** — after a player trains at the club, staff can log presence (attended/missed/rescheduled), free-text feedback, and optional 1-5 rating. Stored in `training_feedback` table. |
| Scout submissions | **Yes** — scouts submit player reports via `/submeter`. Admin reviews and approves via `/admin/pendentes`. Approved submissions create players in the database. |

---

## 3. Implementation Rules

1. **DO NOT invent features** not described in these docs. Build exactly what is specified.
2. **All UI text must be in Portuguese (PT-PT).** Button labels, page titles, error messages, everything.
3. **Mobile-first.** Design for phone first, then adapt for desktop. Scouts use this at the field.
4. **The 10 squad positions are fixed:** GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL. Plus 5 extended (MD, ME, AD, AE, SA) for profiles only.
5. **Shadow squad is the core feature.** The Real vs Shadow comparison view is the most important page.
6. **Each phase should result in a deployable version.** Don't leave things half-built between phases.
7. **Use the provided JSON data files** for initial import. Don't re-parse the Excel — the extraction is already done.
8. **Scraping scripts are Python, not JavaScript.** They run locally on the admin's Mac, not in the browser.
9. **Google Drive access requires Service Account setup** — document the steps for the admin.
10. **Report PDF parsing:** The template is fixed/consistent. Use `pdfplumber` for text extraction and regex for field parsing. The example PDF is provided for reference.
11. **Multi-tenant by default.** All data queries must filter by `club_id`. Never leak data across clubs.
12. **Roles are per-club,** stored in `club_memberships.role`. The `profiles.role` column exists for backward compatibility but `club_memberships.role` is the source of truth.
13. **Superadmin is a boolean,** not a role. `profiles.is_superadmin = true` grants platform-level access. It is orthogonal to club roles.
14. **Dynamic age groups.** Age groups are computed from the current date (season starts July 1). No hardcoded season tables. Use `getAgeGroups()` from `constants.ts`.
15. **Recruitment pipeline statuses** (current, after migration 054): `por_tratar`, `em_contacto`, `vir_treinar`, `reuniao_marcada`, `a_decidir`, `confirmado`, `assinou`, `rejeitado`. The old `a_observar` status was migrated to the `player_lists` system (via `user_observation_list` → `player_lists` + `player_list_items`).
