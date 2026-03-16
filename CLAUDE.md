# CLAUDE.md — Eskout

# IMPORTANT

- Be terse, concise and to the point. Use simple language and short sentences.
- Suggest solutions that I didn't think about—anticipate my needs
- Treat me as an expert
- Be accurate and thorough
- Value good arguments over authorities, the source is irrelevant
- Consider new technologies and contrarian ideas, not just the conventional wisdom
- You may use high levels of speculation or prediction, just flag it for me
- DO NOT BE LAZY! Always read files in full.
- READ the relevant doc before starting any feature — docs are split by topic:
  - `docs/SOP.md` — overview, product decisions, implementation rules (hub document)
  - `docs/FEATURES.md` — feature specs (read this for any feature work)
  - `docs/ARCHITECTURE.md` — DB schema, types, RLS, project structure
  - `docs/DATA.md` — data sources, JSON structure, position normalization
  - `docs/SCRAPING.md` — FPF, ZeroZero, report extraction scripts
  - `docs/UX.md` — design principles, navigation, workflows
  - `docs/ROADMAP.md` — development phases (1-4 done, 5-16 planned)
  - Do NOT invent features not described in these docs.

# CODE MODIFICATION WORKFLOW

- Automatically use context7 for code generation and library documentation.
- Exception: Read-only operations (viewing files, searching, analyzing) do not require Context7.

# UI DESIGN PRINCIPLES

- Minimalist UI with clean, simple layouts.
- ALWAYS think of how the UI will look on mobile, tablet and desktop.
- **Mobile-first** — scouts use this on their phone at the field. Design for phone first, then adapt.
- Follow ARIA guidelines for accessibility.
- All UI text in **Portuguese (PT-PT)**. Every label, button, error message, placeholder.

# CODING PRINCIPLES

## Readability & Consistency

- Prefer clear control flow over micro-optimizations or chained cleverness.
- Keep a consistent voice (naming style, file structure, error shapes).
- Prefer early returns to deep nesting.
- Avoid magic numbers/strings—promote to constants with meaningful names.

## File & Module Hygiene

- Single responsibility per file; extract helpers to /lib or local utils.ts.
- Prefer domain/feature folders over layer-only folders; keep boundaries explicit.
- Soft targets (guardrails, not handcuffs)
  - File length ≤ 250 lines; component ≤ 150 lines; function ≤ 40 lines.
  - Cyclomatic complexity ≤ 10; cognitive complexity ≤ 15.

## Naming & Intent

- Be specific. updateRecruitmentStatus > handleSubmit; PlayerId > Id.
- Use ubiquitous language from the business domain (see Domain Knowledge below).
- Name functions with verb + object; booleans as is/has/can; components as Noun.
- No ambiguous abbreviations.
- Types/interfaces named for capability or shape, not implementation.

# NEXTJS PRINCIPLES

## Architecture & Boundaries

- Default to Server Components. Smaller JS bundles, easier caching, and better perf by default. Use 'use client' only at leaf components that need state, events, or browser APIs. Keep client trees small.
- State strategy. Prefer server-derived state; limit client global state to true UI concerns (e.g., toggles, local filters).
- No accidental client components at the top of the tree.
- Client-only hooks (useEffect, useState, usePathname) appear only under 'use client' files.
- Expensive packages stay on the server.

## Data Fetching, Caching & Revalidation

- Fetch on the server (async components or route handlers). Use built-in caching and explicit revalidation (revalidatePath/revalidateTag) to avoid client waterfalls. Tag long-lived queries for precise invalidation.
- Segment intent. Be explicit with segment config (e.g., export const dynamic = 'force-dynamic') and use generateStaticParams for scale.
- Server Actions for mutations. Co-locate form logic on the server; they integrate with the cache to update UI in one round-trip.
- All reads happen on the server unless strictly interactive.
- Every long-lived fetch is tagged or has a revalidation plan.
- Mutations use Server Actions or route handlers—not ad-hoc client fetches.

## Server Actions

- Prefer Server Actions for mutations (CREATE, UPDATE, DELETE) over API routes.
- Server Actions live in src/actions/, organized by domain (players, pipeline, squads, import, etc.).
- Always validate input with Zod schemas before processing.
- Return ActionResponse<T> for consistent success/error handling.
- Use FormData for progressive enhancement; plain objects for programmatic calls.
- Revalidate cache after mutations using revalidatePath/revalidateTag.
- Keep API Route Handlers for: streaming, webhooks, file uploads with progress.

## Routing & API Surface

- Use App Router with co-located page.tsx/layout.tsx and special files (loading.tsx, error.tsx, not-found.tsx) for resilient UX and streaming.
- Prefer Server Actions (src/actions/) for mutations; Route Handlers (app/api/**/route.ts) for file uploads and webhooks.
- Each route has appropriate loading and error UX.
- APIs typed at the boundary with Zod validation.

## Rendering Strategy

- Static-first where possible; go dynamic for personalization or per-request data.
- Each route documents static vs dynamic choice.
- Streaming used where it moves UX needles.

## Performance Fundamentals

- Use next/image for responsive, lazy, stable images; always supply alt, width, height.
- Use next/font for CLS-safe, self-hosted fonts; prefer variable fonts.
- No raw <img> unless justified.
- Fonts via next/font; no external CSS font fetches.

## TypeScript Discipline

- Enable "strict": true (and keep it on). Use unknown, generics, and satisfies for config objects to protect inference.
- strict enabled; no any escapes.
- Public contracts are typed and stable.
- Configs validated with satisfies.

## Tailwind Usage

- Compose UIs with utilities; extract reusable components.
- Ensure content globs are correct so CSS is purged.
- No style duplication; primitives/components abstract repetition.
- Tailwind content covers all sources.

## Security & Configuration

- Environment variables: only expose via NEXT_PUBLIC on the client; keep secrets server-side.
- Cookies: use cookies() server APIs; set httpOnly, secure, and sameSite.
- Security headers via next.config.js > headers() (CSP, HSTS, X-Content-Type-Options, etc.).
- No secrets in client JS or VCS.

# COMMENTS

- Always add comments to the code you write that is not obvious and/or has a complex logic.
- Do comment code that is obvious.
- NEVER delete comments unless they are no longer relevant, wrong or outdated.
- NEVER delete comments without a reason.

# HEADER COMMENTS

- EVERY file HAS TO start with 4 lines of comments:

1. exact file location in codebase
2. clear description of what this file does
3. clear description of WHY this file exists
4. RELEVANT FILES: comma separated list of the 2-4 files that are relevant to this file

- NEVER delete these header comments from the files you are editing.

# UNIT TESTS

## Stack & Config

- **Jest 29** with `next/jest` SWC transformer (`jest.config.ts`)
- **Default environment**: `node` (server-side tests — actions, lib, API)
- **Component tests**: opt in to `jsdom` via per-file docblock `/** @jest-environment jsdom */`
- **Test discovery**: `src/**/__tests__/**/*.test.ts(x)?`
- **Path alias**: `@/*` → `src/*` mirrored in `moduleNameMapper`
- **Mocks auto-cleared** between tests (`clearMocks: true`)

## Commands

```bash
npm test              # All tests
npm run test:watch    # Watch mode
npm run test:ci       # CI: --ci --forceExit --detectOpenHandles
```

## Conventions

- **Co-locate tests** in `__tests__/` directories next to the source
- **Factory functions over constants** — use `makePlayer()`, `makeAgeGroup()`, etc. to prevent cross-test contamination
- **Mock at module boundary** — `jest.mock("@/lib/supabase", ...)`, not individual functions
- **Header comments** on test files follow the same 4-line convention
- **Section divider comments** — `/* ───────────── Section Name ───────────── */`
- **Portuguese test data** — fixtures use Portuguese names, clubs, and positions

---

## Project Overview

**Eskout** is a mobile-first web application for football club scouting departments to manage youth squad recruitment. It replaces spreadsheets with a structured system for tracking scouted players, building shadow squads, comparing with real squads, and managing the full recruitment pipeline — from initial observation to signing.

**Primary use case**: Boavista FC scouting department, but designed to be generic and sellable to any club worldwide.

**Core feature**: **Real Squad vs Shadow Squad comparison** — the most important view in the app.

**Status**: Greenfield project. Development follows phases defined in `docs/SOP.md`.

---

## Tech Stack

| Layer        | Technology                           | Notes                                                          |
| ------------ | ------------------------------------ | -------------------------------------------------------------- |
| Framework    | Next.js 14+ (App Router) + TypeScript | Strict mode, `src/` directory                                 |
| Styling      | Tailwind CSS + PostCSS               | Mobile-first; inline classes                                   |
| UI Components| shadcn/ui                            | Accessible, customizable components                            |
| Database     | Supabase (PostgreSQL)                | Free tier, auth, realtime, RLS, storage                        |
| Auth         | Supabase Auth                        | Email + password, role-based (admin/scout)                     |
| Icons        | Lucide React                         | Consistent icon library                                        |
| Hosting      | Vercel                               | Free tier, Next.js native                                      |
| Email        | Resend                               | Task assignment notifications, 100/day free tier               |
| Scraping     | Python (standalone scripts)          | Run locally, NOT in the browser                                |

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                 # Root layout (font, providers, age group context)
│   ├── page.tsx                   # Dashboard
│   ├── login/page.tsx             # Login page
│   ├── campo/page.tsx             # Real Squad vs Shadow Squad (PRIMARY VIEW)
│   ├── jogadores/
│   │   ├── page.tsx               # Player database (table + filters)
│   │   ├── [id]/page.tsx          # Player profile
│   │   └── novo/page.tsx          # Add new player form
│   ├── pipeline/page.tsx          # Recruitment pipeline (Kanban/list)
│   ├── posicoes/page.tsx          # Position-by-position view
│   ├── importar/page.tsx          # Excel import (admin only)
│   ├── exportar/page.tsx          # PDF/Excel export (admin only)
│   └── admin/
│       └── utilizadores/page.tsx  # User management (admin only)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx            # Desktop sidebar navigation
│   │   ├── MobileNav.tsx          # Bottom tab navigation (5 tabs)
│   │   └── AgeGroupSelector.tsx   # Persistent age group selector
│   ├── squad/
│   │   ├── RealSquadPanel.tsx     # Real squad grouped by position
│   │   ├── ShadowSquadPanel.tsx   # Shadow squad grouped by position
│   │   ├── FieldView.tsx          # Optional pitch graphic
│   │   └── PositionGroup.tsx      # Position group with player cards
│   ├── players/
│   │   ├── PlayerTable.tsx        # Desktop table view
│   │   ├── PlayerCard.tsx         # Mobile card view
│   │   ├── PlayerFilters.tsx      # Multi-filter panel
│   │   ├── PlayerProfile.tsx      # Full player profile
│   │   ├── PlayerForm.tsx         # Add/edit player form
│   │   ├── ScoutingReports.tsx    # Extracted PDF reports display
│   │   ├── ZeroZeroData.tsx       # ZeroZero scraped data display
│   │   ├── FpfData.tsx            # FPF data + club mismatch alert
│   │   └── StatusHistory.tsx      # Change history log
│   ├── pipeline/
│   │   ├── KanbanBoard.tsx        # Desktop Kanban view
│   │   └── StatusList.tsx         # Mobile list view
│   ├── dashboard/
│   │   ├── StatsCards.tsx         # Counter cards
│   │   ├── RecentChanges.tsx      # Recent status changes
│   │   └── PositionCoverage.tsx   # Position coverage overview
│   └── ui/                        # shadcn/ui components
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Browser Supabase client
│   │   ├── server.ts              # Server-side Supabase client
│   │   ├── auth.ts                # Auth helpers
│   │   └── queries.ts             # Database query functions
│   ├── utils/
│   │   ├── positions.ts           # Position normalization (see Domain Knowledge)
│   │   ├── importExcel.ts         # Excel parser (openpyxl logic ported to JS, or use server action)
│   │   └── exportPdf.ts           # PDF generation
│   ├── validators.ts              # Shared Zod schemas
│   ├── constants.ts               # Business rule constants
│   └── types/
│       └── index.ts               # All TypeScript types (see SOP Section 5.5)
├── hooks/
│   ├── useAuth.ts                 # Auth state hook
│   ├── usePlayers.ts              # Player data hook
│   └── useAgeGroup.ts             # Age group selector hook
├── actions/
│   ├── players.ts                 # Player CRUD
│   ├── pipeline.ts                # Recruitment status changes
│   ├── squads.ts                  # Shadow/real squad management
│   ├── import.ts                  # Excel import processing
│   ├── notes.ts                   # Observation notes (scout)
│   └── users.ts                   # User management (admin)
└── styles/
    └── globals.css
```

**Python scripts (NOT part of Next.js — run locally):**
```
scripts/
├── fpf_scraper.py                 # Scrape current club from FPF
├── zerozero_scraper.py            # Scrape stats from ZeroZero
├── extract_reports.py             # Download + parse scouting report PDFs
└── import_initial_data.py         # One-time import from JSON to Supabase
```

---

## Development Commands

```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:ci          # CI mode

# Code quality
npm run lint             # next lint
npm run format           # prettier --write .
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # Server-only, for admin operations

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Email (Resend — server-only)
RESEND_API_KEY=re_...
EMAIL_FROM=Eskout <noreply@eskout.com>

# Google Drive API (for report extraction script — server/local only)
GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/credentials.json
```

Prefix convention: `NEXT_PUBLIC_` for client-side, unprefixed for server-only.

---

## Code Conventions

### General

- **TypeScript strict mode** — always enabled
- **Server Components by default** — only use `"use client"` when interactivity is required
- **Portuguese (pt-PT)** as the primary locale — all user-facing text in Portuguese
- **Date format**: `dd/MM/yyyy` (Portuguese standard)
- **Path alias**: `@/*` maps to `./src/*`
- **Zod** for all runtime validation (form data, API inputs, env vars)

### Component Patterns

- Inline Tailwind classes (no CSS modules)
- Conditional classes via ternary operators
- `lucide-react` for all icons
- Section divider comments: `/* ───────────── Section Name ───────────── */`
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

### Naming

- Components: PascalCase (`PlayerCard`, `ShadowSquadPanel`)
- Functions/hooks: camelCase (`updateRecruitmentStatus`, `usePlayers`)
- CSS custom properties: kebab-case (`--eskout-black`)
- Database columns: snake_case (Supabase/PostgreSQL convention)

---

## Database Schema

Full SQL schema is in `docs/SOP.md` Section 5.4. Key tables:

| Table                | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| **profiles**         | User profiles (extends Supabase Auth) — admin/scout  |
| **age_groups**       | Age groups (Sub-7 to Sub-19)                         |
| **players**          | All scouted players (1,982 in initial dataset)       |
| **scouting_reports** | Extracted data from PDF observation reports           |
| **status_history**   | Change log (who changed what, when)                  |
| **observation_notes**| Scout field notes                                    |
| **player_list_shares**| Shared list access grants between users             |

72 SQL migrations (001-072) in `supabase/migrations/`. Key recent: 068 (contact purposes), 069 (notification prefs), 071 (decision date), 072 (shared lists).

### Row Level Security

- Everyone can read all data
- Only admins can edit players, reports, age groups
- Scouts can insert players and observation notes
- Status history auto-inserted on changes

---

## UI & Brand Guidelines

### Color Palette

Eskout identity — black & white base with accent colors for status:

```css
/* Brand */
--eskout-black: #1a1a1a;
--eskout-white: #ffffff;
--eskout-gray-50: #fafafa;
--eskout-gray-100: #f5f5f5;
--eskout-gray-200: #e5e5e5;
--eskout-gray-600: #737373;
--eskout-gray-900: #171717;

/* Status colors (department opinion) */
--status-signed: #22c55e;          /* Green — Assinar */
--status-first-choice: #3b82f6;    /* Blue — 1ª Escolha */
--status-follow: #eab308;          /* Yellow — Acompanhar */
--status-urgent: #f97316;          /* Orange — Urgente Observar / 2ª Escolha */
--status-to-observe: #a3a3a3;      /* Gray — Por Observar */
--status-no-interest: #ef4444;     /* Red — Sem interesse */
--status-potential: #a855f7;       /* Purple — Potencial */
--status-training: #06b6d4;        /* Cyan — Ver em treino */
--status-standby: #64748b;         /* Slate — Stand-by */

/* Pipeline colors */
--pipeline-por-tratar: #a3a3a3;
--pipeline-em-contacto: #a855f7;
--pipeline-vir-treinar: #3b82f6;
--pipeline-reuniao-marcada: #f97316;
--pipeline-a-decidir: #1e40af;
--pipeline-confirmado: #22c55e;
--pipeline-assinou: #16a34a;
--pipeline-rejeitado: #ef4444;
```

### Typography

- Font: Inter via `next/font/google`
- Headings: semibold/bold
- Body: regular

### Responsive Breakpoints

- Mobile: 375px (iPhone SE) — **PRIMARY target**
- Tablet: 768px (`md:`)
- Desktop: 1280px+ (`lg:`)
- Mobile nav: bottom tabs (5 tabs: Dashboard, Plantel, Jogadores, Pipeline, Mais)
- Desktop nav: sidebar

---

## Domain Knowledge

### Positions (FIXED — exactly 10, no others)

| Code | Portuguese            | English              |
| ---- | --------------------- | -------------------- |
| GR   | Guarda-Redes          | Goalkeeper           |
| DD   | Defesa Direito        | Right Back           |
| DE   | Defesa Esquerdo       | Left Back            |
| DC   | Defesa Central        | Centre Back          |
| MDC  | Médio Defensivo       | Defensive Midfielder |
| MC   | Médio Centro          | Central Midfielder   |
| MOC  | Médio Ofensivo        | Attacking Midfielder |
| ED   | Extremo Direito       | Right Winger         |
| EE   | Extremo Esquerdo      | Left Winger          |
| PL   | Ponta de Lança        | Striker              |

**There is NO "EXT" position.** Ambiguous "Extremo" without side → leave empty, admin assigns manually.

### Escalão (Age Groups)

| Escalão | Birth Year (2025/26 season) |
| ------- | --------------------------- |
| Sub-7   | 2019                        |
| Sub-8   | 2018                        |
| Sub-9   | 2017                        |
| Sub-10  | 2016                        |
| Sub-11  | 2015                        |
| Sub-12  | 2014                        |
| Sub-13  | 2013                        |
| Sub-14  | 2012                        |
| Sub-15  | 2011                        |
| Sub-16  | 2010                        |
| Sub-17  | 2009                        |
| Sub-18  | 2008                        |
| Sub-19  | 2004-2007                   |

### Department Opinion Values

| Value             | Color  | Meaning                           |
| ----------------- | ------ | --------------------------------- |
| 1ª Escolha        | Blue   | Top priority target               |
| 2ª Escolha        | Orange | Secondary target                  |
| Acompanhar        | Yellow | Keep monitoring                   |
| Por Observar      | Gray   | Not yet scouted in person         |
| Urgente Observar  | Orange | Needs urgent live observation     |
| Sem interesse     | Red    | Not interested                    |
| Potencial         | Purple | Shows potential, needs more time  |
| Ver em treino     | Cyan   | Invited to train, pending eval    |
| Stand-by          | Slate  | Approved but no spot available    |
| Assinar           | Green  | Decision to sign                  |

### Recruitment Pipeline

```
por_tratar → em_contacto → vir_treinar → reuniao_marcada → a_decidir → confirmado → assinou
                                                                      → rejeitado
```

The `a_decidir` status is split into two sub-sections via `decision_side`: `'club'` (default) and `'player'`.

Every status change logs: timestamp, author (user), old value, new value, optional note.

### Core Concepts

- **Real Squad (Plantel Real)**: Players currently at the club. Identified by `is_real_squad = true`.
- **Shadow Squad (Plantel Sombra)**: Best external candidates per position. Identified by `is_shadow_squad = true` + `shadow_position`.
- **The comparison between these two is the PRIMARY feature of the app.**

### Key Portuguese UI Terms

| English            | Portuguese           |
| ------------------ | -------------------- |
| Dashboard          | Painel               |
| Squad              | Plantel              |
| Real Squad         | Plantel Real         |
| Shadow Squad       | Plantel Sombra       |
| Players            | Jogadores            |
| Player Profile     | Ficha do Jogador     |
| Pipeline           | Pipeline             |
| Positions          | Posições             |
| Import             | Importar             |
| Export             | Exportar             |
| Add Player         | Adicionar Jogador    |
| Search             | Pesquisar            |
| Filters            | Filtros              |
| Age Group          | Escalão              |
| Position           | Posição              |
| Club               | Clube                |
| Foot               | Pé                   |
| Right / Left / Both| Dir / Esq / Amb      |
| Strengths          | Pontos Fortes        |
| Weaknesses         | Pontos Fracos        |
| Rating             | Avaliação            |
| Decision           | Decisão              |
| Sign               | Assinar              |
| Follow             | Acompanhar           |
| Review             | Rever                |
| No Interest        | Sem Interesse        |
| Observer           | Observador           |
| Scouting Report    | Relatório Observação |
| Contact            | Contacto             |
| Notes              | Notas                |
| History            | Histórico            |
| Status             | Estado               |
| Save               | Guardar              |
| Cancel             | Cancelar             |
| Edit               | Editar               |
| Delete             | Eliminar             |
| Settings           | Definições           |
| Users              | Utilizadores         |
| Admin              | Administrador        |
| Scout              | Observador           |

---

## Data Files

| File                         | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `docs/SOP.md`                | **THE source of truth** — all features, schema, types, phases    |
| `docs/report_template.pdf`   | Example scouting report PDF (for building the parser)            |
| `data/all_players.json`      | 1,982 players from all age groups (with FPF + report links)      |
| `data/players_2012.json`     | 244 players gen 2012 (subset for testing)                        |

---

## Development Phases

Defined in detail in `docs/SOP.md` Section 9. Summary:

1. **Phase 1 — Foundation (MVP)**: Supabase + Auth + Import + Player table + Profile + Deploy
2. **Phase 2 — Planning & Recruitment**: Real vs Shadow view + Pipeline + Position view + Notes
3. **Phase 3 — External Data**: PDF report extraction + FPF scraper + ZeroZero scraper
4. **Phase 4 — Polish**: Export + Dashboard metrics + PWA + User management

**Each phase must result in a deployable version. Do not leave things half-built.**

---

## Deployment

- **Platform**: Vercel (free tier)
- **Domain**: TBD (eskout.com if available)
- **Branch**: `main` (production)
