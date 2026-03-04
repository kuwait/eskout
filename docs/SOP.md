# SOP — Boavista FC Youth Squad Planning Tool

**Version:** 3.0 | **Date:** March 4, 2026 | **UI Language:** Portuguese (PT-PT)

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

### 1.4. Positions (FIXED LIST — use these exactly)
The app uses exactly these 10 position codes throughout:

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

**There is NO "EXT" (generic winger) position.** If the original data has "Extremo" or "Ala" without a side, it must be manually classified as ED or EE by the admin, or left blank for later assignment.

### 1.5. Users
- **Admin** (formation coordinators, head of scouting): Full CRUD — players, squads, status, user management
- **Scout** (field observers): Read-only on most data + can add new players + can add observation notes. They use the app primarily on their phone at the field.

### 1.6. Hosting & Stack
- **Frontend:** Vercel (free tier) — Next.js
- **Backend/DB:** Supabase (free tier) — PostgreSQL + Auth + Realtime + Storage

---

## 2. Data Sources

### 2.1. Primary Database (Excel Import)

**Source file:** `Base_de_Dados_de_Scouting-_Boavista_FC.xlsx`
**Main sheet:** "Base de dados Nova"
**Total players:** 1,982 across all age groups
**Players with FPF link:** 1,980 (99.9%)

**Columns in the Excel file:**

| Col | Header | Type | Notes |
|-----|--------|------|-------|
| A (1) | Nome | Text | Full name |
| B (2) | Opinião Departamento | Text | Values: 1ª Escolha, 2ª Escolha, Acompanhar, Por Observar, Urgente Observar, Sem interesse, Potencial |
| C (3) | FPF | Hyperlink | Cell displays "LINK" but actual URL is in `cell.hyperlink.target`. MUST extract via openpyxl hyperlink, NOT cell value. |
| D (4) | Ano | Formula | `=IF(ISBLANK(F{row}),,YEAR(F{row}))` — MUST use `data_only=True` in openpyxl to get computed value |
| E (5) | Idade | Formula | Age calculation |
| F (6) | Nascimento | Date | Python datetime object |
| G (7) | Clube | Text | Club at time of scouting — MAY BE OUTDATED |
| H (8) | Posição | Text | Free text, inconsistent — NEEDS NORMALIZATION (see Section 11) |
| I (9) | Pé | Text | Dir, Esq, Amb |
| J (10) | Número | Text | Shirt number |
| K (11) | Contacto | Text | Parent/guardian contact. May contain `\n` |
| L (12) | Referenciado | Text | Scout who referred. May contain `\n` |
| M (13) | Observações | Text | Free notes |
| N (14) | Observador | Text | Match observer(s). May contain `\n` |
| O (15) | Avaliação Observador | Text | 2 - Dúvida, 3 - Bom, 4 - Muito Bom, 5 - Excelente |
| P (16) | Decisão Observador | Text | Assinar, Acompanhar, Rever, Sem Interesse |
| Q-V (17-22) | Relatório Observação 1-6 | Text + Hyperlink | Label text in cell value, PDF link in `cell.hyperlink.target` (Google Drive) |

**CRITICAL parsing notes:**
- Column D (Year) is a formula. Open with `openpyxl.load_workbook(file, data_only=True)`.
- Column C (FPF) and Q-V (Reports) have hyperlinks. Extract with `cell.hyperlink.target`.
- Cells may contain `\n` newlines — normalize to ` / ` or `, `.
- Some players have no position, no foot, or other missing fields — handle gracefully.

### 2.2. Age Group Distribution

| Age Group | Birth Year | Players |
|-----------|-----------|---------|
| Sub-15 | 2011 | 376 |
| Sub-14 | 2012 | 244 |
| Sub-17 | 2009 | 242 |
| Sub-19 | 2004-2007 | 215 |
| Sub-12 | 2014 | 210 |
| Sub-13 | 2013 | 206 |
| Sub-16 | 2010 | 189 |
| Sub-18 | 2008 | 158 |
| Sub-11 | 2015 | 84 |
| Sub-10 | 2016 | 47 |
| Sub-9/8/7 | 2017-2019 | 11 |
| **Total** | | **1,982** |

**Birth year → Age group mapping (season 2025/2026):**
2019→Sub-7, 2018→Sub-8, 2017→Sub-9, 2016→Sub-10, 2015→Sub-11, 2014→Sub-12, 2013→Sub-13, 2012→Sub-14, 2011→Sub-15, 2010→Sub-16, 2009→Sub-17, 2008→Sub-18, 2004-2007→Sub-19

### 2.3. Pre-defined Shadow Squad (Generation 2012 only)
Pre-load these into the app as shadow squad players. Other age groups start with empty shadow squads.

**GR (5):** Lucas Correia (Lourosa), Afonso Isac (Dragon Force), Santiago Casimiro (Famalicão), Santiago Coutinho (Famalicão), Veniamin Negrych (Arcozelo)

**DE (5):** Gustavo Mota Silva (Salgueiros), Tiago Correia (Dragon Force), Daniel Marques (Leixões), Júlio Lopes (Famalicão), Nuno Porto (Foz)

**DC (10):** Martim Silva/Tim (Grijó), Nélson (Salgueiros), Tiago Rodrigues (Salgueiros), Martim Castro (Alfenense), Duarte Moreira (Lousada), Guilherme Sousa (Leixões), Carlos Soares (Hernâni), João Andrade (Coimbrões), Gonçalo Rodrigues (Coimbrões), Tiago Teixeira (Leça Academia)

**DD (4):** Pedro Bento (Hernâni), Vasco (Arcozelo), Jose Matias (Varzim), Arthur Neves (Alfenense)

**MC (19):** Marco Rafael Leão (Lousada), Afonso Fonseca (Maia), João Tavares (Grijó), Francisco Brandão (Lourosa), Tiago Martinez (Alfenense), Afonso Sousa (Nogueirense), Guilherme Carvalho (Salgueiros), Salvador Babo Coelho (Panther Force), Afonso Rocha (Foz), Luís Ferreira (Salgueiros), Tomás Rocha (Maia), Araújo (Varzim), Gonçalo Sardinha Capingala (Foz), Filipe Viana (Dragon Force), Rodrigo Castelo (Famalicão), Santiago Pinto (Maia), Duarte Outeiro (Col. Ermesinde), João Beleza (Leça), Pedro Bento (Grijó)

**EE/ED (9):** Salvador Costa (Salgueiros), Tomé Bessa (Oliveira do Douro), Manuel Mendes (Foz), Miguel Freitas (Hernâni), Luís Wozniak (Leça), Leandro Lopes (Alfenense), Daniel Santos (Lousada), Martim Magalhães (Alfenense), Lourenço Rosário (Lousada)

**PL (8):** Afonso Silva (Salgueiros), Pedro Gonçalves (Leça), João Fernandes (Sra. da Hora), João Silva (Salgueiros), Tomás Grilo (Dragon Force), Diogo Batista (Famalicão), Martim Almeida (Valadares), Rafael Kole (Col. Ermesinde)

**Unpositioned / To Observe (4):** Gabriel Muenho Silva (Gandra), Afonso Martins (Padroense), Afonso Peixoto (Padroense), Adilson Chimbundo (Valadares)

### 2.4. Scouting Report PDFs

**Total:** 1,545 PDFs across 1,203 players
**Storage:** Google Drive (links in Excel columns Q-V as hyperlinks)
**Format:** `https://drive.google.com/file/d/{FILE_ID}`

All PDFs follow the same Boavista FC template. Fields to extract:

| Category | Field | DB Column |
|----------|-------|-----------|
| Match | Competição | competition |
| Match | Escalão | age_group |
| Match | Jogo | match |
| Match | Data | match_date |
| Match | Resultado | match_result |
| Player | Nome | player_name_report |
| Player | Número | shirt_number_report |
| Player | Ano Nascimento | birth_year_report |
| Player | Pé | foot_report |
| Player | Equipa | team_report |
| Player | Posição | position_report |
| Assessment | Perfil Físico | physical_profile |
| Assessment | Pontos Fortes | strengths |
| Assessment | Pontos Fracos | weaknesses |
| Rating | Avaliação (1-5) | rating |
| Rating | Decisão | decision |
| Rating | Análise | analysis |
| Meta | Contacto | contact_info |
| Meta | Scout / Observador | scout_name |

### 2.5. External Data: FPF
- URL: `https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/{ID}`
- Data: Current club
- Purpose: Detect club changes since scouting
- 1,980 players have FPF links

### 2.6. External Data: ZeroZero
- URL: `https://www.zerozero.pt/jogador/{slug}/{id}`
- Data: Current club/team, games, goals, team history, height, weight, photo, season stats
- Purpose: Enrich player profiles
- Links added manually by admin in app
- Returns 403 on basic scraping — needs realistic headers/cookies/sessions

---

## 3. Product Decisions

| Decision | Choice |
|----------|--------|
| Formation | **Dynamic** — no fixed formation. Field view groups by position categories. |
| Squad size | **Dynamic** — no limit. |
| Multi-age-group | **Yes** — all age groups supported |
| Multi-user | **Yes** — Admin + Scout roles |
| Authentication | Email + password per user |
| Profiles | Admin (full edit) / Scout (read + add notes + add players) |
| Add new players | Directly in the app |
| Change history | Yes — every status change logged with date, author, old→new |
| Export | PDF and Excel |
| Mobile | **Mobile-first** — scouts use phone at the field |
| UI Language | **Portuguese (PT-PT)** |
| Shadow squad | Pre-loaded for gen 2012, editable. Other age groups start empty. |
| Club difficulty | Not needed — scouts know |
| ZeroZero link | Manual entry by admin |
| FPF link | Auto-imported from Excel |

---

## 4. Features

### 4.1. Authentication & User Management
- Login page: email + password (Supabase Auth)
- Two roles: `admin` and `scout`
- Admin: create/edit/delete users, assign roles
- Session persistence across browser sessions
- Protected routes → redirect to login if unauthenticated

### 4.2. Age Group Selector
- Persistent dropdown/tabs at top of every page
- All views filter by selected age group
- Shows: "Sub-15 (2011)" format
- Remembers selection across sessions
- Age groups determined from data in database

### 4.3. Dashboard
For the selected age group:
- **Counters:** Total scouted, in real squad, in shadow squad, by recruitment status
- **Department opinion breakdown:** Bar chart or badges showing count per opinion
- **Position coverage:** For each of the 10 positions → count in real squad / count in shadow squad / total candidates
- **Recent changes:** Last 10 status changes (date, author, player, change)
- **Alerts:** Players whose FPF club differs from DB club, positions with zero shadow squad candidates

### 4.4. Real Squad vs Shadow Squad (PRIMARY VIEW)

**This is the most important page in the app.**

Two panels side by side (desktop) or stacked (mobile):

**Real Squad panel:**
- All players at Boavista for this age group
- Grouped by position: GR → DD → DE → DC → MDC → MC → MOC → ED → EE → PL
- Each player card: name, position, foot
- Admin can add players here (mark as "at Boavista")

**Shadow Squad panel:**
- Best external candidates by position (same position grouping)
- Each player card: name, club, opinion badge, observer rating
- Admin can add/remove players, change shadow position
- Click any player → opens full profile

**Visual comparison:**
- Position groups aligned side by side
- Highlight positions where real squad is thin but shadow squad has candidates
- Highlight positions where shadow squad is also thin (urgent need)

**Optional field graphic:**
- Football pitch with position zones
- Toggle between real/shadow layers
- Click zone to see all candidates
- On mobile: the field is secondary; the grouped list IS the primary view

### 4.5. Player Database
Full table/list of all players for selected age group:

**Search:** Instant search by name (client-side)

**Filters (multi-select where applicable):**
- Position (GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL)
- Club
- Department opinion
- Observer rating
- Observer decision
- Foot (Dir, Esq, Amb)
- Recruitment status
- Shadow squad (yes/no)
- Real squad (yes/no)

**Sorting:** By any column

**Color coding (department opinion):**
- 🟢 Green → At Boavista (real squad)
- 🔵 Blue → 1ª Escolha
- 🟡 Yellow → Acompanhar
- 🟠 Orange → Urgente Observar / 2ª Escolha
- ⚪ Gray → Por Observar
- 🔴 Red → Sem interesse
- 🟣 Purple → Potencial

**Mobile:** Card layout (name, position, club, badges). Tap → profile.
**Desktop:** Full table with all columns.

**Add player button** → opens form (Section 4.9)

### 4.6. Player Profile
Dedicated page `/jogadores/{id}` — see Section 2 of this SOP for all available fields. Display:

**Header:** Name, age group, position, foot, opinion badge, status badge

**Sections (collapsible):**
1. **Basic Info** — DOB, age, club, number, contact, referred by, observer, eval, decision, notes
2. **External Links** — FPF button, ZeroZero button (+ editable URL field for admin)
3. **Club Verification** — FPF current club vs DB club vs ZeroZero club (if scraped). Alert if mismatch.
4. **ZeroZero Data** — Games, goals, height, weight, photo, team history (if scraped)
5. **Scouting Reports** — Chronological cards from extracted PDFs. Each shows: date, match, scout, rating, decision. Expandable for full text (physical profile, strengths, weaknesses, analysis). Link to original PDF.
6. **Observation Notes** — Notes added by scouts in the app. Chronological. Shows author and date.
7. **Recruitment** — Current status badge + dropdown to change (admin). Notes field. Full change history log.

**Actions:**
- Admin: Edit any field, change status, add/remove shadow squad, edit ZeroZero link
- Scout: Add observation note, view everything

### 4.7. Recruitment Pipeline
Each player has exactly one recruitment status:

| Status | Label (PT) | Description | Color |
|--------|-----------|-------------|-------|
| `pool` | Pool | In database, no action taken | Gray |
| `shortlist` | Shortlist | In shadow squad / confirmed interest | Blue |
| `to_observe` | A Observar | Needs to be scouted/re-evaluated | Yellow |
| `target` | Alvo | Decision to approach made | Orange |
| `in_contact` | Em Contacto | Contact initiated with player/family/club | Purple |
| `negotiating` | Em Negociação | Negotiation in progress | Dark Blue |
| `confirmed` | Confirmado | Verbal agreement or signed | Green |
| `rejected` | Rejeitado | No interest or impossible to sign | Red |

**Desktop:** Kanban board — columns per status, drag players between columns (admin only)
**Mobile:** Filtered list by status

Every status change creates a `status_history` entry with: timestamp, author, old value, new value, optional note.

### 4.8. Position View
For each of the 10 positions (GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL):
- Players in real squad for this position
- Players in shadow squad for this position
- Remaining candidates (pool) for this position
- Visual indicator: position is "covered" (enough depth) or "needs attention"

### 4.9. Add New Player (Mobile-Optimized Form)
- Minimum required: Name, Date of Birth, Position, Club
- Optional: All other fields (foot, contact, FPF link, ZeroZero link, notes, etc.)
- Age group auto-determined from date of birth
- New players default to: status=`pool`, opinion=`Por Observar`
- Available to both Admin and Scout roles

### 4.10. Excel Import
- Upload `.xlsx` file
- Parse sheet "Base de dados Nova" (or detect correct sheet)
- Extract all columns including hyperlinks (FPF + report PDFs)
- Auto-detect age group from birth year
- Detect duplicates by name + date of birth
- Show preview before confirming import
- Admin only

### 4.11. Export
- **PDF:** Squad report — real squad + shadow squad by position, player cards
- **Excel:** Full database filtered by current view (age group, filters)
- Admin only

### 4.12. Observation Notes (Scout Feature)
- Add from player profile page
- Fields: Content (text, required), Match context (text, optional)
- Auto-set author and timestamp
- Mobile-optimized: large text area, minimal fields

---

## 5. Technical Architecture

### 5.1. Stack

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

### 5.2. Why Supabase?
- Multi-user requires a real database
- Auth included (email + password)
- Row Level Security for admin vs scout permissions
- Free tier: 500MB DB, 1GB storage, 50K auth requests/month
- JavaScript SDK for frontend
- Realtime: admin changes status → scouts see immediately

### 5.3. Project Structure

```
boavista-planner/
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Dashboard
│   │   ├── login/page.tsx
│   │   ├── campo/page.tsx             # Real vs Shadow squad view
│   │   ├── jogadores/
│   │   │   ├── page.tsx               # Player database table
│   │   │   ├── [id]/page.tsx          # Player profile
│   │   │   └── novo/page.tsx          # Add new player
│   │   ├── pipeline/page.tsx          # Recruitment pipeline
│   │   ├── posicoes/page.tsx          # Position view
│   │   ├── importar/page.tsx          # Excel import (admin)
│   │   ├── exportar/page.tsx          # Export (admin)
│   │   └── admin/
│   │       └── utilizadores/page.tsx  # User management
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx            # Desktop sidebar nav
│   │   │   ├── MobileNav.tsx          # Bottom tab navigation
│   │   │   └── AgeGroupSelector.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx
│   │   │   ├── RecentChanges.tsx
│   │   │   └── PositionCoverage.tsx
│   │   ├── squad/
│   │   │   ├── RealSquadPanel.tsx
│   │   │   ├── ShadowSquadPanel.tsx
│   │   │   ├── FieldView.tsx          # Optional pitch graphic
│   │   │   └── PositionGroup.tsx
│   │   ├── players/
│   │   │   ├── PlayerTable.tsx
│   │   │   ├── PlayerCard.tsx         # Mobile card
│   │   │   ├── PlayerFilters.tsx
│   │   │   ├── PlayerProfile.tsx
│   │   │   ├── PlayerForm.tsx
│   │   │   ├── ZeroZeroData.tsx
│   │   │   ├── FpfData.tsx
│   │   │   ├── ScoutingReports.tsx
│   │   │   └── StatusHistory.tsx
│   │   ├── pipeline/
│   │   │   ├── KanbanBoard.tsx
│   │   │   └── StatusList.tsx         # Mobile list
│   │   └── common/
│   │       ├── StatusBadge.tsx
│   │       ├── OpinionBadge.tsx
│   │       └── SearchBar.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts              # Server-side client
│   │   │   ├── auth.ts
│   │   │   └── queries.ts
│   │   ├── utils/
│   │   │   ├── positions.ts           # Position normalization
│   │   │   ├── importExcel.ts         # Excel parser
│   │   │   └── exportPdf.ts
│   │   └── types/
│   │       └── index.ts
│   └── hooks/
│       ├── useAuth.ts
│       ├── usePlayers.ts
│       └── useAgeGroup.ts
├── scripts/
│   ├── fpf_scraper.py
│   ├── zerozero_scraper.py
│   ├── extract_reports.py             # PDF report extraction
│   └── import_initial_data.py         # One-time data import
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_seed_data.sql
├── data/
│   ├── all_players.json               # 1,982 players extracted from Excel
│   └── players_2012.json              # 244 players (gen 2012 subset)
├── public/
│   └── field.svg
├── package.json
├── tailwind.config.ts
└── README.md
```

### 5.4. Database Schema (PostgreSQL / Supabase)

```sql
-- ============================================
-- TABLE: profiles (extends Supabase Auth users)
-- ============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'scout')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: age_groups
-- ============================================
CREATE TABLE age_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                -- "Sub-15"
  generation_year INT NOT NULL,      -- 2012
  season TEXT NOT NULL,              -- "2025/2026"
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
  club TEXT,                          -- Club from DB (may be outdated)
  position_original TEXT,             -- Free text from Excel
  position_normalized TEXT            -- MUST be one of: GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL, or empty
    CHECK (position_normalized IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL','')),
  foot TEXT CHECK (foot IN ('Dir', 'Esq', 'Amb', '')),
  shirt_number TEXT,
  contact TEXT,

  -- Internal classifications
  department_opinion TEXT,            -- 1ª Escolha, 2ª Escolha, Acompanhar, Por Observar, Urgente Observar, Sem interesse, Potencial
  observer TEXT,
  observer_eval TEXT,                 -- 2 - Dúvida, 3 - Bom, 4 - Muito Bom, 5 - Excelente
  observer_decision TEXT,             -- Assinar, Acompanhar, Rever, Sem Interesse
  referred_by TEXT,
  notes TEXT,

  -- Report labels (from Excel cell values — the text, not the PDF content)
  report_label_1 TEXT,
  report_label_2 TEXT,
  report_label_3 TEXT,
  report_label_4 TEXT,
  report_label_5 TEXT,
  report_label_6 TEXT,

  -- Report Google Drive links (from Excel hyperlinks)
  report_link_1 TEXT,
  report_link_2 TEXT,
  report_link_3 TEXT,
  report_link_4 TEXT,
  report_link_5 TEXT,
  report_link_6 TEXT,

  -- External links
  fpf_link TEXT,
  fpf_player_id TEXT,                 -- Extracted from URL: playerId={THIS}
  zerozero_link TEXT,                 -- Manually added by admin
  zerozero_player_id TEXT,

  -- FPF scraped data
  fpf_current_club TEXT,
  fpf_last_checked TIMESTAMPTZ,

  -- ZeroZero scraped data
  zz_current_club TEXT,
  zz_current_team TEXT,               -- e.g. "Sub-15"
  zz_games_season INT,
  zz_goals_season INT,
  zz_height INT,                      -- cm
  zz_weight INT,                      -- kg
  zz_photo_url TEXT,
  zz_team_history JSONB,              -- [{club, season, games, goals}]
  zz_last_checked TIMESTAMPTZ,

  -- Recruitment
  recruitment_status TEXT DEFAULT 'pool'
    CHECK (recruitment_status IN ('pool','shortlist','to_observe','target','in_contact','negotiating','confirmed','rejected')),
  recruitment_notes TEXT,

  -- Squad membership
  is_real_squad BOOLEAN DEFAULT FALSE,   -- Player is at Boavista
  is_shadow_squad BOOLEAN DEFAULT FALSE,
  shadow_position TEXT                   -- Position in shadow squad (may differ from original)
    CHECK (shadow_position IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR shadow_position IS NULL),

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

  -- Source
  gdrive_file_id TEXT NOT NULL,
  gdrive_link TEXT,
  report_number INT,                    -- 1-6 (position in Excel)
  pdf_filename TEXT,

  -- Match context
  competition TEXT,
  age_group TEXT,
  match TEXT,
  match_date DATE,
  match_result TEXT,

  -- Player data at time of observation
  player_name_report TEXT,
  shirt_number_report TEXT,
  birth_year_report TEXT,
  foot_report TEXT,
  team_report TEXT,
  position_report TEXT,

  -- Qualitative assessment
  physical_profile TEXT,
  strengths TEXT,
  weaknesses TEXT,

  -- Quantitative assessment
  rating INT CHECK (rating BETWEEN 1 AND 5),
  decision TEXT,
  analysis TEXT,

  -- Meta
  contact_info TEXT,
  scout_name TEXT,

  -- Extraction tracking
  raw_text TEXT,
  extraction_status TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'success', 'partial', 'error')),
  extraction_error TEXT,
  extracted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: status_history (change log)
-- ============================================
CREATE TABLE status_history (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: observation_notes (scout notes)
-- ============================================
CREATE TABLE observation_notes (
  id SERIAL PRIMARY KEY,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  match_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_players_age_group ON players(age_group_id);
CREATE INDEX idx_players_position ON players(position_normalized);
CREATE INDEX idx_players_status ON players(recruitment_status);
CREATE INDEX idx_players_shadow ON players(is_shadow_squad);
CREATE INDEX idx_players_real ON players(is_real_squad);
CREATE INDEX idx_players_opinion ON players(department_opinion);
CREATE INDEX idx_reports_player ON scouting_reports(player_id);
CREATE INDEX idx_reports_status ON scouting_reports(extraction_status);
CREATE INDEX idx_history_player ON status_history(player_id);
CREATE INDEX idx_notes_player ON observation_notes(player_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE age_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "read_all_players" ON players FOR SELECT USING (true);
CREATE POLICY "read_all_reports" ON scouting_reports FOR SELECT USING (true);
CREATE POLICY "read_all_history" ON status_history FOR SELECT USING (true);
CREATE POLICY "read_all_notes" ON observation_notes FOR SELECT USING (true);
CREATE POLICY "read_all_age_groups" ON age_groups FOR SELECT USING (true);
CREATE POLICY "read_own_profile" ON profiles FOR SELECT USING (true);

-- Admins can write everything
CREATE POLICY "admin_write_players" ON players FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_write_reports" ON scouting_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_write_age_groups" ON age_groups FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_write_profiles" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Scouts can insert players and notes
CREATE POLICY "scout_insert_players" ON players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'scout'))
);
CREATE POLICY "anyone_insert_notes" ON observation_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id
);

-- System inserts history (via triggers or app logic)
CREATE POLICY "system_insert_history" ON status_history FOR INSERT WITH CHECK (true);
```

### 5.5. TypeScript Types

```typescript
// Position codes — EXACTLY these 10, no others
type PositionCode = 'GR' | 'DD' | 'DE' | 'DC' | 'MDC' | 'MC' | 'MOC' | 'ED' | 'EE' | 'PL';

type DepartmentOpinion =
  | '1ª Escolha' | '2ª Escolha' | 'Acompanhar'
  | 'Por Observar' | 'Urgente Observar' | 'Sem interesse' | 'Potencial';

type ObserverEval = '' | '2 - Dúvida' | '3 - Bom' | '4 - Muito Bom' | '5 - Excelente';
type ObserverDecision = '' | 'Assinar' | 'Acompanhar' | 'Rever' | 'Sem Interesse';

type RecruitmentStatus =
  | 'pool' | 'shortlist' | 'to_observe' | 'target'
  | 'in_contact' | 'negotiating' | 'confirmed' | 'rejected';

type UserRole = 'admin' | 'scout';

interface Player {
  id: number;
  ageGroupId: number;
  name: string;
  dob: string | null;
  club: string;
  positionOriginal: string;
  positionNormalized: PositionCode | '';
  foot: 'Dir' | 'Esq' | 'Amb' | '';
  shirtNumber: string;
  contact: string;
  departmentOpinion: DepartmentOpinion | '';
  observer: string;
  observerEval: ObserverEval;
  observerDecision: ObserverDecision;
  referredBy: string;
  notes: string;
  reportLabels: string[];        // Up to 6
  reportLinks: string[];         // Up to 6 (Google Drive URLs)
  fpfLink: string;
  fpfPlayerId: string;
  zerozeroLink: string;
  zerozeroPlayerId: string;
  fpfCurrentClub: string | null;
  fpfLastChecked: string | null;
  zzCurrentClub: string | null;
  zzCurrentTeam: string | null;
  zzGamesSeason: number | null;
  zzGoalsSeason: number | null;
  zzHeight: number | null;
  zzWeight: number | null;
  zzPhotoUrl: string | null;
  zzTeamHistory: { club: string; season: string; games: number; goals: number }[] | null;
  zzLastChecked: string | null;
  recruitmentStatus: RecruitmentStatus;
  recruitmentNotes: string;
  isRealSquad: boolean;
  isShadowSquad: boolean;
  shadowPosition: PositionCode | null;
}

interface ScoutingReport {
  id: number;
  playerId: number;
  gdriveFileId: string;
  gdriveLink: string;
  reportNumber: number;
  competition: string;
  ageGroup: string;
  match: string;
  matchDate: string | null;
  matchResult: string;
  playerNameReport: string;
  shirtNumberReport: string;
  birthYearReport: string;
  footReport: string;
  teamReport: string;
  positionReport: string;
  physicalProfile: string;
  strengths: string;
  weaknesses: string;
  rating: number | null;
  decision: string;
  analysis: string;
  contactInfo: string;
  scoutName: string;
  extractionStatus: 'pending' | 'success' | 'partial' | 'error';
}

interface StatusHistoryEntry {
  id: number;
  playerId: number;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;          // user UUID
  changedByName: string;      // resolved name
  notes: string | null;
  createdAt: string;
}

interface ObservationNote {
  id: number;
  playerId: number;
  authorId: string;
  authorName: string;
  content: string;
  matchContext: string | null;
  createdAt: string;
}
```

---

## 6. Scraping Scripts

### 6.1. FPF Scraper (`scripts/fpf_scraper.py`)

**Purpose:** Update `fpf_current_club` for each player by scraping their FPF page.

**Process:**
1. Read players with `fpf_link` from Supabase (or local JSON)
2. For each player: GET the FPF page
3. Parse HTML to extract current club name
4. Compare with `club` field in DB
5. Update `fpf_current_club` and `fpf_last_checked`
6. If club changed: log the change

**CLI:**
```bash
python scripts/fpf_scraper.py --all
python scripts/fpf_scraper.py --shortlist          # Shadow squad only
python scripts/fpf_scraper.py --limit 30
python scripts/fpf_scraper.py --proxy socks5://127.0.0.1:9050
```

### 6.2. ZeroZero Scraper (`scripts/zerozero_scraper.py`)

**Purpose:** Enrich player profiles with stats from ZeroZero.

**Process:**
1. Read players with `zerozero_link` from Supabase
2. For each: GET the ZeroZero page
3. Parse HTML: club, team, games, goals, history, height, weight, photo
4. Update `zz_*` fields in DB

**CLI:**
```bash
python scripts/zerozero_scraper.py --all
python scripts/zerozero_scraper.py --new-only
python scripts/zerozero_scraper.py --player-id 42
```

### 6.3. Report Extractor (`scripts/extract_reports.py`)

**Purpose:** Download PDFs from Google Drive and extract structured data.

**Prerequisites:**
- Google Cloud project with Drive API enabled
- Service Account with JSON key
- Share the Google Drive report folder with the Service Account email (read access)

**Environment variables:**
```
GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/credentials.json
```

**Process:**
1. Read players with `report_link_*` from Supabase
2. For each report link: extract Google Drive file ID from URL
3. Download PDF via Google Drive API
4. Extract text with `pdfplumber`
5. Parse structured fields (the template is fixed — use regex or positional parsing)
6. Insert into `scouting_reports` table
7. Update `extraction_status`

**CLI:**
```bash
python scripts/extract_reports.py --all
python scripts/extract_reports.py --new-only
python scripts/extract_reports.py --player-id 42
python scripts/extract_reports.py --age-group Sub-14
python scripts/extract_reports.py --retry-errors
```

### 6.4. Anti-Blocking Strategy (FPF + ZeroZero scrapers)
- Random delay between requests: 5-12 seconds
- Long pause between batches of 15-20: 60-120 seconds
- Rotate 15+ real User-Agent strings (Chrome/Firefox/Safari on Mac/Windows)
- Full realistic headers: Accept, Accept-Language, Accept-Encoding, Referer, Connection
- Persistent session with cookies (`requests.Session()`)
- Exponential backoff on 429/403: 30s → 90s → 270s
- Configurable max requests per run (`--limit N`)
- Incremental progress saving (resume if interrupted)
- HTTP/SOCKS5 proxy support (`--proxy`)
- Priority mode: process shadow squad / 1ª Escolha first
- Max ~200 requests/day per site
- Detailed logging: timestamp, status code, response time

### 6.5. Google Drive API Rate Limiting (Report Extractor)
- Generous limits (12,000 queries/minute) but be conservative
- 1-2 second delay between downloads
- Process in batches of 50, pause 30s between batches
- Local PDF cache (don't re-download)
- Retry with backoff on 429/500

---

## 7. UX & Interface

### 7.1. Design Principles
- **Mobile-first** — scouts use their phone at the field
- **Simple and clean** — minimum clicks for common actions
- **Team identity** — Boavista FC colors: black and white/checkered as brand identity
- **Immediate feedback** — toast notifications for actions
- **Portuguese throughout** — all labels, buttons, messages in PT-PT

### 7.2. Mobile Navigation (Bottom Tabs)
1. **Dashboard** (home icon)
2. **Plantel** (field/pitch icon) — Real vs Shadow view
3. **Jogadores** (people icon) — Player database
4. **Pipeline** (funnel icon) — Recruitment pipeline
5. **Mais** (menu icon) — Position view, Import, Export, Admin

### 7.3. Desktop Navigation (Sidebar)
- Dashboard
- Plantel (Real vs Shadow)
- Jogadores
- Pipeline
- Posições
- Importar (admin)
- Exportar (admin)
- Utilizadores (admin)

---

## 8. Workflows

### 8.1. Initial Setup
1. Create Supabase project (DB + Auth)
2. Run SQL migrations
3. Deploy frontend to Vercel
4. Create first admin user
5. Upload Excel via Import page → populates database
6. Shadow squad for gen 2012 is pre-loaded during import

### 8.2. Daily Use
1. Open app → Dashboard for selected age group
2. Check Plantel view → compare real vs shadow squads
3. Browse by position → identify gaps
4. Click player → view full profile
5. Admin: change status, move to shadow squad, edit data
6. Scout: add observation note after watching a match

### 8.3. Scout at the Field (Mobile)
1. Open app on phone
2. Jogadores → + Novo (Add New)
3. Fill: name, position, club, date of birth
4. Optionally paste FPF link
5. Save → player appears with status "pool" for admin to review

### 8.4. Update External Data (Weekly/Monthly)
1. Run `fpf_scraper.py` in terminal
2. Run `zerozero_scraper.py` in terminal
3. Run `extract_reports.py` for new reports
4. Data updates directly in Supabase
5. Dashboard shows alerts for club changes

---

## 9. Development Phases

### Phase 1 — Foundation (MVP)
Build the core app that replaces the spreadsheet.

- [ ] Setup Supabase project (database, auth, RLS policies)
- [ ] Setup Next.js 14+ with App Router + TypeScript + Tailwind + shadcn/ui
- [ ] Authentication: login page, session management, role-based access
- [ ] Age group selector (persistent across pages)
- [ ] Excel import: upload, parse with openpyxl logic, extract hyperlinks, populate DB
- [ ] Player database: table (desktop) + card list (mobile), search, filters, sorting
- [ ] Player profile page: all basic data, report labels, external link buttons
- [ ] Color coding by department opinion
- [ ] Add new player form (mobile-optimized)
- [ ] Deploy to Vercel
- [ ] Seed data: pre-load the 2012 shadow squad

**Deliverable:** Working app where users can log in, browse players, search/filter, view profiles.

### Phase 2 — Planning & Recruitment
Add the core planning tools.

- [ ] Real Squad vs Shadow Squad view (the PRIMARY planning page)
- [ ] Shadow squad management: add/remove, assign shadow position
- [ ] Real squad management: mark players as "at Boavista"
- [ ] Position view: all 10 positions with real/shadow/pool breakdown
- [ ] Recruitment pipeline: status management with Kanban (desktop) + list (mobile)
- [ ] Status change with automatic history logging
- [ ] Observation notes (scout feature)
- [ ] Dashboard: counters, position coverage, recent changes, alerts

**Deliverable:** Full planning workflow — scouts and admins can manage the recruitment process.

### Phase 3 — External Data & Reports
Enrich player profiles with external data.

- [ ] Setup Google Cloud Service Account + Drive API credentials
- [ ] `extract_reports.py`: download PDFs, parse template, insert structured data
- [ ] Display extracted reports on player profile (chronological, expandable cards)
- [ ] Rating evolution chart (if player has multiple reports)
- [ ] `fpf_scraper.py`: scrape current club, update DB, detect changes
- [ ] FPF data display on player profile + club mismatch alert
- [ ] ZeroZero link field on player profile (admin-editable)
- [ ] `zerozero_scraper.py`: scrape stats/history, update DB
- [ ] ZeroZero data display on player profile (stats, history, photo)
- [ ] Dashboard alerts for club changes

**Deliverable:** Enriched player profiles with scouting reports, current club verification, and match statistics.

### Phase 4 — Polish & Export
Final refinements.

- [ ] PDF export: squad report (real + shadow by position)
- [ ] Excel export: filtered database
- [ ] Dashboard complete with all metrics
- [ ] Mobile optimizations (touch targets, swipe gestures, responsive layouts)
- [ ] User management page (admin: create/edit/delete users)
- [ ] PWA setup (installable on phone, offline caching for read-only data)

**Deliverable:** Production-ready application.

---

## 10. Data Files for Repository

| File | Description |
|------|-------------|
| `data/all_players.json` | 1,982 players from all age groups, extracted from Excel (with FPF links and report Google Drive links) |
| `data/players_2012.json` | 244 players from generation 2012 (subset for testing) |
| `docs/SOP.md` | This document |
| `docs/report_template_example.pdf` | Example scouting report PDF for reference when building the parser |

### JSON Structure (`all_players.json`)
Each player object has these fields:
```json
{
  "id": 0,
  "name": "Rodrigo Jesus Almeida",
  "year": "2012",
  "escalao": "Sub-14",
  "op": "1ª Escolha",
  "dob": "12/01/2012",
  "club": "Boavista Futebol Clube",
  "pos": "Ponta de Lança",
  "pn": "PL",
  "foot": "Dir",
  "num": "45",
  "contact": "Marco | 912 726 422",
  "ref": "Diogo Nunes",
  "notes": "Único Sub11 a jogar Sub13 2ª Divisão - Titular",
  "obs": "",
  "eval": "",
  "dec": "",
  "fpf": "https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/1853103",
  "reports": ["Report label 1", "Report label 2"],
  "reportLinks": [
    {"num": 1, "label": "2012 Rodrigo Almeida - Boavista FC", "link": "https://drive.google.com/file/d/ABC123"}
  ],
  "status": "signed"
}
```

---

## 11. Position Normalization Reference

The Excel data has free-text positions with many variations. Map them to the 10 position codes:

| Normalized | Input Variations |
|------------|-----------------|
| GR | Guarda Redes, Guarda-Redes, guarda redes |
| DD | Lateral Direito |
| DE | Lateral Esquerdo, DAE, DE/DD |
| DC | Defesa Central, DC, DC/MDC, DC/DE, Defesa-Central, Defesa, Def |
| MDC | Pivô, Médio Defensivo, MDC, Medio Def, Médio Defensivo Centro |
| MC | Médio Centro, MC, Medio Centro, Médio |
| MOC | Médio Ofensivo, MCO, MOD, Médio Ofensivo Centro, MC / MCO |
| ED | Extremo Direito, ED, Ala Direito, Ala direito, ED/PL, ED/DE |
| EE | Extremo Esquerdo, EE, Ala Esquerdo, EE/PL |
| PL | Ponta de Lança, PL, Avançado, Avançado Centro, Avançado/Extremo |

**Ambiguous cases:**
- "Extremo" or "Ala" (without side) → Leave `position_normalized` empty. Admin assigns ED or EE manually in the app.
- "Médio" (without qualifier) → Map to MC
- Compound positions like "DC/MDC" → Map to the first position (DC)
- "Defesa Esquerdo/Extremo Esquerdo" → Map to DE (primary position)

---

## 12. IMPORTANT IMPLEMENTATION NOTES

1. **DO NOT invent features** not described in this SOP. Build exactly what is specified.
2. **All UI text must be in Portuguese (PT-PT).** Button labels, page titles, error messages, everything.
3. **Mobile-first.** Design for phone first, then adapt for desktop. Scouts use this at the field.
4. **The 10 positions are fixed:** GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL. No others.
5. **Shadow squad is the core feature.** The Real vs Shadow comparison view is the most important page.
6. **Each phase should result in a deployable version.** Don't leave things half-built between phases.
7. **Use the provided JSON data files** for initial import. Don't re-parse the Excel — the extraction is already done.
8. **Scraping scripts are Python, not JavaScript.** They run locally on the admin's Mac, not in the browser.
9. **Google Drive access requires Service Account setup** — document the steps for the admin.
10. **Report PDF parsing:** The template is fixed/consistent. Use `pdfplumber` for text extraction and regex for field parsing. The example PDF is provided for reference.
