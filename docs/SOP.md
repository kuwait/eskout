# SOP — Eskout

**Version:** 8.0 | **Date:** March 9, 2026 | **UI Language:** Portuguese (PT-PT)

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
A mobile-first web application for Boavista FC's scouting department to manage youth squad recruitment across all age groups. The core workflow is: scout players → evaluate → build a shadow squad of the best candidates per position → compare with the real squad → decide who to approach → track recruitment pipeline.

### 1.2. Problem Statement
The scouting department currently uses a Google Sheets spreadsheet with ~2000 scouted players across all age groups. This is hard to navigate, has no visual position mapping, no recruitment pipeline, and clubs may be outdated (players transfer frequently at youth level). Scouting reports are PDFs scattered across Google Drive with no structured data extraction.

### 1.3. Core Concepts

**Real Squad (Plantel Real):** Players currently signed to Boavista FC for each age group. This is the actual team roster.

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

Four roles with progressively restricted access:

| Role | Who | Access |
|------|-----|--------|
| **Admin** | Head of scouting, system owner | Full access. User management, club settings, import, export, delete players, all CRUD. |
| **Editor** | Formation coordinators, senior scouts | Everything except admin area: can view/edit all data, manage squads, pipeline, calendar. Cannot manage users, import, export, or delete players. |
| **Scout** | External/freelance scouts | Can only access dedicated submission page (`/submeter`) and own reports (`/meus-relatorios`). Cannot view the database, squads, pipeline, or any other page. |
| **Recruiter** (Recrutador) | Club staff handling negotiations/signing | Can see plantéis (real + shadow), pipeline, calendário, posições, and player profiles. **Cannot** see scouting intelligence (ratings, observations, notes, history, recruitment details in profiles), full player list (`/`), alerts, or export. Redirected to `/campo/real` as home. |

**Superadmin** (`profiles.is_superadmin = true`): Platform-level access via `/master` panel. Can manage all clubs, users, feature toggles. Can impersonate any role via cookie-based override for testing (4h TTL).

### 1.6. Hosting & Stack
- **Frontend:** Vercel (free tier) — Next.js
- **Backend/DB:** Supabase (free tier) — PostgreSQL + Auth + Realtime + Storage

---

## 2. Product Decisions

| Decision | Choice |
|----------|--------|
| Formation | **Dynamic** — no fixed formation. Field view groups by position categories. Formation view available as visual overlay. |
| Squad size | **Dynamic** — no limit. DC position supports sub-slots for finer granularity. |
| Multi-age-group | **Yes** — all age groups supported |
| Multi-user | **Yes** — 4 roles: Admin, Master, Scout, Scout Externo |
| Authentication | Email + password per user |
| Profiles | Admin (full access) / Master (all except admin area) / Scout (all except delete) / Scout Externo (submit only) |
| Add new players | Directly in the app |
| Change history | Yes — every status change logged with date, author, old→new |
| Export | PDF, image, text, WhatsApp-formatted, and print for squads. Excel/PDF/JSON export at `/exportar`. |
| Mobile | **Mobile-first** — scouts use phone at the field |
| UI Language | **Portuguese (PT-PT)** |
| Shadow squad | Pre-loaded for gen 2012, editable. Other age groups start empty. |
| Club difficulty | Not needed — scouts know |
| ZeroZero link | Manual entry by admin |
| FPF link | Auto-imported from Excel |
| Calendar | **Yes** — scouting calendar for scheduling observations, matches, and meetings. |
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

---

## 3. Implementation Rules

1. **DO NOT invent features** not described in these docs. Build exactly what is specified.
2. **All UI text must be in Portuguese (PT-PT).** Button labels, page titles, error messages, everything.
3. **Mobile-first.** Design for phone first, then adapt for desktop. Scouts use this at the field.
4. **The 10 positions are fixed:** GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL. No others.
5. **Shadow squad is the core feature.** The Real vs Shadow comparison view is the most important page.
6. **Each phase should result in a deployable version.** Don't leave things half-built between phases.
7. **Use the provided JSON data files** for initial import. Don't re-parse the Excel — the extraction is already done.
8. **Scraping scripts are Python, not JavaScript.** They run locally on the admin's Mac, not in the browser.
9. **Google Drive access requires Service Account setup** — document the steps for the admin.
10. **Report PDF parsing:** The template is fixed/consistent. Use `pdfplumber` for text extraction and regex for field parsing. The example PDF is provided for reference.
