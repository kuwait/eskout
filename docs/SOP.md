# SOP — Boavista FC Youth Squad Planning Tool

**Version:** 7.2 | **Date:** March 7, 2026 | **UI Language:** Portuguese (PT-PT)

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
| **Admin** | Head of scouting, system owner | Full access. User management, import, export, delete players, all CRUD. |
| **Master** | Formation coordinators, senior scouts | Everything except admin area: can view/edit all data, manage squads, pipeline, calendar. Cannot manage users, import, export, or delete players. |
| **Scout** | Internal field observers | Can view all pages and data. Can add players, add observation notes, edit player data, manage pipeline/squads/calendar. Cannot delete players. |
| **Scout Externo** | External/freelance scouts | Can only access a dedicated player submission page. Cannot view the database, squads, pipeline, or any other page. |

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

## 4. Features

### 4.1. Authentication & User Management
- Login page: email + password (Supabase Auth)
- Three roles: `admin`, `editor`, `scout`
- Admin: full access — create/edit/delete users, assign roles, approve/reject scout reports, delete players
- Editor: can edit players, manage squads/pipeline, approve/reject scout reports — cannot delete players or manage users
- Scout: can only access `/submeter` (report submission) and `/meus-relatorios` (own reports) — redirected away from all other routes
- User management: invite via email (Supabase Auth), set password on first login, soft delete (deactivate/reactivate)
- Session persistence across browser sessions
- Protected routes → redirect to login if unauthenticated
- Role-based route protection via middleware:
  - **Admin only:** `/admin/*` (utilizadores, relatórios)
  - **Admin + Editor:** All main pages (dashboard, campo, jogadores, pipeline, posições, calendário, alertas)
  - **Scout:** Only `/submeter`, `/meus-relatorios`, `/mais` — all other routes redirect to `/meus-relatorios`

### 4.2. Age Group Selector
- Three display variants:
  - **Dropdown** — standard select, used in simple contexts
  - **Tabs** — horizontal scrollable pills, used for pages with many options
  - **Navigator** — arrow-based `← Sub-15 →` control with dropdown on tap; used on squad and pipeline pages where the selected group must always be visible
- Navigator variant: compact card with prev/next arrows, tap name opens dropdown with all options. Supports "Todos" option when applicable.
- Remembers selection per page across sessions (localStorage)
- Age groups determined from data in database
- Shows: "Sub-15" or birth year (e.g., "2011") depending on context

### 4.3. Dashboard
For the selected age group:
- **Counters:** Total scouted, in real squad, in shadow squad, by recruitment status
- **Department opinion breakdown:** Bar chart or badges showing count per opinion
- **Position coverage:** For each of the 10 positions → count in real squad / count in shadow squad / total candidates
- **Recent changes:** Last 10 status changes (date, author, player, change)
- **Alerts:** Players whose FPF club differs from DB club, positions with zero shadow squad candidates

### 4.4. Real Squad vs Shadow Squad (PRIMARY VIEW)

**This is the most important page in the app.**

Multiple views available via tabs/sub-routes (`/campo`, `/campo/real`, `/campo/sombra`):

**Real Squad panel (`/campo/real`):**
- All players at Boavista for this age group
- Grouped by position: GR → DD → DE → DC → MDC → MC → MOC → ED → EE → PL
- Each player card: name, position, foot, photo avatar
- Admin can add players here (mark as "at Boavista")
- Players can be manually reordered within position groups (`squad_order`)
- Add player dialog: pre-fills position and birth year filters, hides players already in squad
- **Cross-age-group add:** players from other age groups can be added; their `age_group_id` is updated to the current squad's age group ("call up" concept)
- Age group selector uses the navigator variant (`← Sub-15 →`)

**Shadow Squad panel (`/campo/sombra`):**
- Best external candidates by position (same position grouping)
- Each player card: name, club, opinion badge, observer rating, photo avatar
- Admin can add/remove players, change shadow position
- Click any player → opens full profile (inline popup)
- Players can be manually reordered within position groups (`squad_order`)
- Add player dialog: pre-fills position filter, shows only players from the same birth year, hides players already in squad (no year filter shown since it's implicit)
- Age group selector uses the navigator variant with birth year labels

**Compare view (`/campo`):**
- Side-by-side comparison of real vs shadow
- Position groups aligned side by side
- Highlight positions where real squad is thin but shadow squad has candidates
- Highlight positions where shadow squad is also thin (urgent need)

**Squad export:**
- Export menu with PDF, image, text, WhatsApp, and print options (see Section 4.11)

**Formation view:**
- Football pitch graphic with position zones (formation slots)
- Visual overlay of players on a pitch layout
- DC sub-slots (DC_E/DC_D) for left/right central defenders
- **Desktop (lg+):** horizontal pitch layout with columns for position groups (GR → defense → midfield → attack → PL)
- **Mobile/Tablet (<lg):** vertical pitch layout, positions stacked top-to-bottom (GR top, PL bottom). Compact cards showing name + club; tap to expand for details and actions.
- Drag-and-drop between positions and within positions for reordering
- **Conditional rendering:** Desktop and mobile layouts are conditionally rendered (not CSS-hidden) to avoid duplicate `@dnd-kit` droppable IDs. Uses `useIsDesktop()` media query hook at the 1024px breakpoint. This is critical — having both layouts in the DOM simultaneously breaks DnD collision detection.
- **iPhone landscape fix:** Breakpoint at `lg` (1024px) ensures iPhone landscape (~844px) uses the mobile vertical layout, not the desktop horizontal layout

### 4.5. Player Database
Full table/list of all players (fetched once, filtered client-side):

**Search:** Instant fuzzy search by name (client-side)

**Filters:**
- **Birth year** — dropdown with all available years (replaces age group selector on this page)
- Position (GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL)
- Club
- Department opinion
- Foot (Dir, Esq, Amb)
- Recruitment status
- **Date of birth range** — collapsible "Data nascimento" panel with from/to date pickers. Defaults to Jul 1 – Dec 31 of the selected birth year when opened.
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

**Mobile:** Card layout with eval rating circle (colored), name, position, club, badges. Tap → profile.

**Desktop table columns (in order):**
1. **Avaliação** — colored circle (h-8) with rating number + label text. Rating colors: 1=red, 2=orange, 3=blue, 4=emerald, 5=dark emerald. Default sort: eval descending.
2. **Nome** — player photo (h-14, rounded, lazy loaded, `unoptimized` for external URLs) + name + club subtitle. Fallback: neutral User icon.
3. **Nasc.** — date in dd/MM/yyyy + "X anos" subtitle.
4. **Posição** — color-coded pills (green=primary, yellow=secondary, orange=tertiary) + "Pé Direito/Esquerdo/Ambidestro" subtitle. Hover shows pitch position map via HoverCard (Radix portal, escapes table overflow).
5. **Opinião** — OpinionBadge pills.
6. **Estado** — StatusBadge.

- Entire row clickable → navigates to player profile
- Columns are resizable (drag handles) and sortable (click header)

**Add player button** → opens form (Section 4.9)

### 4.6. Player Profile
Dedicated page `/jogadores/{id}` — see Section 2 of this SOP for all available fields. Display:

**Header:** Name, age group, position dots (color-coded: green=primary, yellow=secondary, orange=tertiary), opinion badge. Photo avatar with fallback to initials.

**Multi-position support:** Each player can have up to 3 positions:
- **Primary** (`position_normalized`) — always shown, green dot
- **Secondary** (`secondary_position`) — optional, yellow dot
- **Tertiary** (`tertiary_position`) — optional, orange dot
- All three shown on the mini pitch visualization with color-coded highlights
- Edit form has 3 position dropdowns (Principal, Secundaria, Terciaria)

**Sections (collapsible):**
1. **Basic Info** — DOB, age, club, number, foot (full labels: Direito/Esquerdo/Ambidestro), contact, referred by, observer(s) (label pluralizes: "Observador"/"Observadores"), eval, decision, notes. Multiple observers displayed as individual cards with left border bar for visual separation.
2. **External Links** — FPF button, ZeroZero button (+ editable URL field for admin)
3. **Club Verification** — FPF current club vs DB club vs ZeroZero club (if scraped). Alert if mismatch.
4. **ZeroZero Data** — Games, goals, height, weight, photo, team history (if scraped)
5. **Scouting Reports** — Chronological cards from extracted PDFs. Each shows: date, match, scout, rating, decision. Expandable for full text (physical profile, strengths, weaknesses, analysis). Link to original PDF.
6. **Observation Notes** — Notes added by scouts in the app. Chronological. Shows author, date, and priority. Delete button (admin or author). See Section 4.12.
7. **Recruitment** — Current status badge + dropdown to change (admin). Notes field. Full change history log (deduped: entries where old=new are filtered out).

**Profile export:**
- **Export as image (PNG):** Uses `html2canvas-pro` to capture the profile DOM. External images (FPF/ZeroZero photos) are pre-converted to data URLs via server-side proxy (`/api/image-proxy`) to bypass CORS. Buttons/headers hidden during capture via `data-export-hide` attribute. 24px padding added.
- **Print:** Captures profile as image, opens in new window with `window.print()`. Uses `@page { margin: 0 }` to remove browser headers/footers.

**Actions by role:**
- **Admin:** Edit any field (including 3 positions), change status, add/remove shadow squad, edit ZeroZero link, set photo URL, set meeting date, set signing date, delete player, delete any observation note
- **Master:** Same as Admin except: cannot delete players
- **Scout:** Same as Master, can delete own observation notes
- **Scout Externo:** No access to this page

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
| `assinou` | Assinou | Player signed — contract confirmed. Includes `signing_date` field. | Dark Green |
| `rejected` | Rejeitado | No interest or impossible to sign | Red |

**All screens:** Kanban board — columns per status, drag players between columns (admin, master, scout). Players can be manually reordered within columns (`pipeline_order`). Columns can be reordered and persist via localStorage.
- **Desktop:** horizontal scroll with columns side by side
- **Mobile:** vertical stack with full-width columns, vertical scroll. Same DnD as desktop.
- Age group selector uses the navigator variant (`← Sub-15 →`) with "Todos" option.

Every status change creates a `status_history` entry with: timestamp, author, old value, new value, optional note.

### 4.8. Position View
For each of the 10 positions (GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL):
- Players in real squad for this position
- Players in shadow squad for this position
- Remaining candidates (pool) for this position
- Visual indicator: position is "covered" (enough depth) or "needs attention"

### 4.9. Add New Player (Link-First Form)
**Link-first flow** — the primary way to add a player is via FPF/ZeroZero links:
1. User pastes FPF and/or ZeroZero URL(s) in a dark hero card
2. Clicks "Buscar dados do jogador" → `scrapeFromLinks()` server action scrapes both in parallel
3. Form pre-fills with scraped data: name, DOB, club, position, foot, shirt number, photo, height, weight, nationality, birth country
4. User reviews and edits any field, then saves

**Manual fallback** — "Inserir manualmente" button skips scraping, shows empty form.

- Minimum required: Name, Date of Birth, Club
- Optional: All other fields (position, foot, contact, FPF link, ZeroZero link, notes, etc.)
- Age group auto-determined from date of birth
- New players default to: status=`pool`, opinion=`Por Observar`
- **Duplicate detection** on save: checks FPF link, ZeroZero link, and name+DOB (case-insensitive). Returns existing player name and ID in error message.
- Available to: Admin, Editor
- **Scout** uses a separate submission page (`/submeter`) — see Section 4.16

### 4.16. Scout Report Submission (`/submeter`)
Dedicated mobile-first page for scouts to submit player observation reports.

- **FPF link required** — paste link, auto-scrape player data (name, club, DOB, nationality, birth country)
- **ZeroZero auto-find** — after FPF scrape, auto-searches ZeroZero via multi-strategy autocomplete. Shows confirmation card (amber) with photo/name/age/club/position — scout accepts or rejects
- **Auto-saved scraped data** — nationality, birth country, height, weight, photo, DOB, positions (primary/secondary/tertiary), FPF/ZZ player IDs — all stored silently, no input fields
- **Scout evaluation fields:** position (if not from ZZ), competition, match (team vs team), date, score, physical profile, strengths, weaknesses, star rating (1-5 with hover preview), decision, phone contact
- **Inline validation** — required fields (position, rating, decision) highlighted on submit attempt
- **FPF link validation** — rejects non-player URLs (club pages, etc.)
- **Phone auto-format** — digits formatted as `912 345 678` or `+351 912 345 678`
- **Limpar button** — resets entire form, only visible after data fetched
- After submit → redirects to `/meus-relatorios`
- Reports stored in `scout_reports` table with all data needed to create a player on approval

### 4.18. My Reports (`/meus-relatorios`)
Scout's view of their own submitted reports.

- List of all reports submitted by the current scout, ordered by date
- Each card shows: player name, club, position, match, decision, rating stars, strengths/weaknesses preview, status badge (Pendente/Aprovado/Rejeitado)
- Cards are clickable → detail page (`/meus-relatorios/[id]`) with full report data
- Detail page shows all submitted data: player info with photo, match context, evaluation, contact, submission timestamp

### 4.19. Admin Report Review (`/admin/relatorios`)
Admin page to review, approve, or reject scout-submitted reports.

- Lists all scout reports from all scouts with author name
- **Filter tabs:** Pendentes (default) / Aprovados / Rejeitados / Todos
- **Pending count badge** — red badge on Pendentes tab and sidebar, dynamically updated
- Each report clickable → detail view with full data + action buttons
- **Approve** → creates player from report data:
  - All scraped data maps to player fields (name, club, DOB, positions, foot, shirt, photo, height, weight, nationality, links, IDs)
  - Age group auto-detected from DOB (including Sénior for players born before Sub-19 range)
  - Duplicate detection by FPF link — if player exists, links report to existing player instead
  - Scout evaluation saved as `scouting_reports` entry (not observation note)
  - Recruitment status set to `por_tratar`
  - Redirects admin to the created/linked player profile
- **Reject** → marks report as rejected

#### Admin Reports — Sub-pages (tab navigation)

The admin reports section has 3 tabs:

1. **Relatórios** (`/admin/relatorios`) — main report list with:
   - KPI cards (total reports, pending, this week, scouts count)
   - Highlight chips (most observed player, most active scout, week's best)
   - Searchable, filterable, sortable report list with inline tag buttons (priority, review, contact)
   - Slide-over detail panel matching player profile report dialog style
   - URL-driven pagination

2. **Scouts** (`/admin/relatorios/scouts`) — per-scout analytics:
   - GitHub-style 365-day activity heatmap
   - Scout stats cards with sparkline charts (reports, avg rating, positions covered)

3. **Consenso** (`/admin/relatorios/consenso`) — multi-scout divergence view:
   - Shows players observed by 2+ scouts where agreement < 80%
   - Cards sorted worst-first with severity badges (Crítico / Grave / Moderado / Ligeiro)
   - Colored left border by severity (red → orange → amber)
   - Player position badge (from players table) + club logo via ClubBadge
   - Divergence reasons: rating spread + decision conflicts
   - Scout rows colored by rating with decision label
   - Dismiss to localStorage (resurfaces when new reports arrive)
   - Masonry layout (1–5 columns responsive), max 18 visible
   - Click card → player profile

### 4.10. Excel Import
- Upload `.xlsx` file
- Parse sheet "Base de dados Nova" (or detect correct sheet)
- Extract all columns including hyperlinks (FPF + report PDFs)
- Auto-detect age group from birth year
- Detect duplicates by name + date of birth
- Show preview before confirming import
- Admin only

### 4.11. Export
**Squad export** (from Plantel view):
- **PDF:** Squad report — real squad + shadow squad by position, player cards
- **Image:** Export squad as image (PNG)
- **Text:** Plain text export (copy to clipboard)
- **WhatsApp:** Pre-formatted text optimized for WhatsApp sharing
- **Print:** Browser print dialog

**Database export** (planned):
- **Excel:** Full database filtered by current view (age group, filters)
- Admin only

### 4.12. Observation Notes (Scout Feature)
- Add from player profile page
- Fields: Content (text, required), Match context (text, optional), Priority (normal/importante/urgente)
- **Priority system:**
  - **Normal** (default) — standard note, no special styling
  - **Importante** — yellow left border, yellow background tint, star icon
  - **Urgente** — red left border, red background tint, alert icon
- Priority selector: 3 pill buttons (Normal/Importante/Urgente) in the note creation form
- Notes display with priority-based visual styling (border color, background color, icon)
- Auto-set author and timestamp
- **Deletion:** Admin can delete any note; author can delete own notes. Uses styled confirmation dialog (not browser `confirm()`). RLS policy enforces ownership check.
- Mobile-optimized: large text area, minimal fields

### 4.17. Flagged Notes Page (`/alertas`)
A dedicated page showing all observation notes marked as "importante" or "urgente" across all players.

- **Navigation:** Accessible via "Notas Prioritarias" tab in sidebar (desktop) and "Prioritarias" tab in mobile nav
- **Badge counts:** Red badge for urgent count, yellow badge for important count — shown on both sidebar and mobile nav. Counts fetched server-side in AppShell.
- **Display:** Each note shows player photo (via next/image), player name (clickable link to profile), note content, priority styling, author name, date
- **Dismissal:** Notes can be deleted (same delete action as in player profile). Optimistic removal from list.
- **Empty state:** Bell icon + "Tudo limpo" message when no flagged notes exist
- **Server component:** Page fetches flagged notes server-side via `getFlaggedNotes()` query

### 4.13. Calendar (Scouting Schedule)
A calendar for scheduling and tracking scouting activities.

- **Views:** Month grid (desktop) + list view (mobile)
- **Event types:** Observação (scouting), Jogo (match), Reunião (meeting), Outro (other)
- **Event fields:** Title, date, time (optional), type, age group, location (optional), notes (optional), linked players (optional)
- **Player linking:** Events can be linked to specific players via a player picker dialog
- **Export:** Calendar events can be exported
- **Color coding:** Events color-coded by type
- Available to: Admin, Master, Scout

### 4.14. Player Photos
- `photo_url` field on player profile (admin-editable)
- Displayed as avatar throughout the app (player cards, profile, squad views)
- Falls back to initials avatar when no photo set

### 4.15. DC Sub-Slots
- The DC (Defesa Central) position supports sub-slot classification for finer tactical granularity
- Allows distinguishing between left-sided DC and right-sided DC within the squad view

### 4.18. Observation Tier (Estado de Observação)
- Computed field (not stored in DB) that classifies players by their information level
- **Exclusive hierarchy** — shows only the highest tier:
  1. **Observado** (green `FileText` icon) — has at least one scouting report (`report_link_*`)
  2. **Referenciado** (amber `Eye` icon) — has `referred_by` field filled, no reports
  3. **Adicionado** (gray `Plus` icon) — neither reports nor referral
- **Displayed in:** PlayerCard (icon only), PlayerTable (icon only), PlayerProfile (icon + label on desktop, icon only on mobile/tablet)
- **Filterable** in the player list via "Observação" dropdown
- Utility: `getObservationTier(player)` in `src/lib/constants.ts`
- Component: `src/components/common/ObservationBadge.tsx`
- Profile header breakpoint: mini pitch + rating widget only visible at `xl:` (1280px+); below that, mobile layout with inline rating bar

### 4.19. Hybrid Rating System (Avaliação Híbrida)
- **Primary rating** = report average (from `scouting_reports.rating`) if available, else manual `observer_eval`, else none
- Report average displayed as decimal (1 decimal place, e.g., "3.8"); manual stays integer format ("4 - Muito Bom")
- **Cards/Table:** single primary rating circle — uses report avg when available, else manual
- **Profile header:** shows primary + secondary when both exist (report avg as primary widget, manual as small text below)
- **Profile detail section:** manual `observer_eval` always shown in Scouting section (editable)
- Manual eval stays editable even when reports exist — they are independent
- Null report ratings are ignored when computing average
- `reportAvgRating` and `reportRatingCount` added to `Player` type (populated at fetch time, not stored in DB)
- Utility: `getPrimaryRating(player)` in `src/lib/constants.ts`
- Table/Card label for averages: "N rel." (report count); for manual: text label (e.g., "Muito Bom")
- Color mapping: based on `Math.round(primaryValue)` using shared `RATING_COLORS` palette

### 4.20. Weekly Calendar View (Vista Semanal do Calendário)
- Calendar supports two views: **Mês** (month grid/list) and **Semana** (week day-by-day)
- View toggle is client-side (segmented control, no server roundtrip)
- Week view shows Monday–Sunday with events grouped by day, sorted by time
- Month/week picker via popover: year nav + month grid (month view) or month selector + weeks list (week view)
- Smart navigation: stays client-side within loaded month data, navigates to server when crossing month boundaries
- URL params: `?view=week&date=YYYY-MM-DD` for week view, `?year=N&month=N` for month
- Current month/week highlighted in emerald in the picker
- Files: `CalendarWeek.tsx`, `CalendarView.tsx`, `dates.ts` (week range utilities)

### 4.21. Scout Evaluations (Avaliações de Scouts)
- **Per-scout star rating** (1–5) — one evaluation per scout per player, upserted on click
- Interactive 5-star widget for the current user ("A tua avaliação"), click same star to delete
- **Global average** combines all scout evaluations + scouting report ratings into one aggregated score
- Aggregated row: partial-fill stars (SVG clipPath) + decimal average + count label, clickable for detail popup
- Popup sections: own eval pinned at top, report ratings (with scout name), other scouts (sorted by rating desc)
- Color-coded by rating: 1=red, 2=orange, 3=blue, 4=emerald, 5=dark emerald
- Rating labels: 1=Fraco, 2=Dúvida, 3=Bom, 4=Muito Bom, 5=Excelente
- DB: `scout_evaluations` table with unique constraint on (player_id, user_id)
- Server actions: `upsertScoutEvaluation()`, `deleteScoutEvaluation()` in `src/actions/evaluations.ts`
- Component: `src/components/players/ScoutEvaluations.tsx`

### 4.22. Profile UX Improvements
- **Empty sections hidden**: Info Básica hides empty fields, Recrutamento/Histórico sections hidden when empty
- **Profile completeness card**: progress bar (core fields only: name, dob, club, position, nationality, foot) + actionable chip suggestions (core + optional fields like photo, links, shirt number)
- **Referência field**: `referred_by` shown as "Referência" in Info Básica, separate from observer
- **Edit form redesign**:
  - Two-column layout: Info Básica (left) + Posição interactive pitch picker (right)
  - Nationality: Select dropdown with flag emojis
  - Foot: 3 toggle buttons (Direito/Esquerdo/Ambidestro)
  - Decision: toggle buttons (Assinar/Acompanhar/Rever/Sem Interesse)
  - Opinião Departamento: toggle chips with multi-select
  - Shirt number: Jersey SVG trigger + popup with 99-number grid, hover-preview on jersey
  - Links: full-width mono inputs
  - Interactive pitch position picker: click dots to assign primary→secondary→tertiary, click again to remove
- **Refresh button**: compact "Atualizar" with temporary check icon state (no text feedback)

### 4.23. Club Logos (Emblemas de Clube)
- Club logo URL scraped from **FPF** (`model.CurrentClubImage`) and **ZeroZero** (`zz-enthdr-club` img)
- Stored in `club_logo_url` column on `players` table (migration 020)
- ZeroZero logo preferred (higher res), FPF as fallback
- **ClubBadge component** (`src/components/common/ClubBadge.tsx`): shows logo + club name inline; hover popover with larger logo
- Used in: PlayerProfile (Info Básica), PlayerTable (under name), PlayerCard (mobile)
- If no logo URL: renders plain text only (no placeholder icon)
- FPF placeholder images (`/Portals/.../placeholder_Male.png`) rejected by scraper and mapper

### 4.24. Table UX Improvements
- **Middle-click** on player row opens profile in new tab (`onAuxClick`)
- **Photo hover**: hovering over player photo in table shows 288px popover preview
- Profile completeness suggestions: core fields + FPF/ZeroZero links only (no evaluation, no recruitment status, no photo)
- Invalid/placeholder photo URLs filtered at mapper level (`isValidImageUrl`)

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
- Row Level Security for role-based permissions (admin/master/scout/scout_externo)
- Free tier: 500MB DB, 1GB storage, 50K auth requests/month
- JavaScript SDK for frontend
- Realtime: status changes propagate to all connected users

### 5.3. Project Structure

```
sikout/
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout (font, providers, age group context)
│   │   ├── page.tsx                   # Dashboard
│   │   ├── login/page.tsx
│   │   ├── campo/
│   │   │   ├── page.tsx               # Squad compare view (real vs shadow)
│   │   │   ├── real/page.tsx          # Real squad panel
│   │   │   └── sombra/page.tsx        # Shadow squad panel
│   │   ├── jogadores/
│   │   │   ├── page.tsx               # Player database table
│   │   │   ├── [id]/page.tsx          # Player profile
│   │   │   └── novo/page.tsx          # Add new player
│   │   ├── pipeline/page.tsx          # Recruitment pipeline
│   │   ├── posicoes/page.tsx          # Position view
│   │   ├── calendario/page.tsx        # Scouting calendar
│   │   ├── alertas/page.tsx            # Flagged notes inbox (importante/urgente)
│   │   ├── mais/page.tsx              # "More" page (mobile overflow menu)
│   │   ├── api/
│   │   │   └── image-proxy/route.ts   # Server-side image proxy for CORS bypass (profile export)
│   │   ├── submeter/page.tsx          # Scout report submission form
│   │   ├── meus-relatorios/
│   │   │   ├── page.tsx              # Scout's own reports list
│   │   │   └── [id]/page.tsx         # Report detail view
│   │   ├── definir-password/page.tsx # Set password after invite
│   │   ├── auth/confirm/route.ts     # Token exchange for invite flow
│   │   ├── importar/page.tsx          # Excel import (admin) — PLANNED
│   │   ├── exportar/page.tsx          # Export (admin) — PLANNED
│   │   └── admin/
│   │       └── utilizadores/page.tsx  # User management — PLANNED
│   ├── actions/
│   │   ├── auth.ts                    # Auth server actions
│   │   ├── players.ts                 # Player CRUD
│   │   ├── pipeline.ts                # Recruitment status changes
│   │   ├── squads.ts                  # Shadow/real squad management
│   │   ├── notes.ts                   # Observation notes
│   │   └── calendar.ts               # Calendar event CRUD
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx           # Server-side app shell
│   │   │   ├── AppShellClient.tsx     # Client-side app shell with responsive nav
│   │   │   ├── Sidebar.tsx            # Desktop sidebar nav
│   │   │   ├── MobileDrawer.tsx        # Hamburger slide-out menu (mirrors sidebar)
│   │   │   └── AgeGroupSelector.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx
│   │   │   ├── RecentChanges.tsx
│   │   │   ├── PositionCoverage.tsx
│   │   │   └── FlaggedNotesInbox.tsx  # Flagged notes display for /alertas page
│   │   ├── squad/
│   │   │   ├── CampoView.tsx          # Main campo orchestrator
│   │   │   ├── SquadCompareView.tsx   # Side-by-side comparison
│   │   │   ├── SquadPanelView.tsx     # Individual squad panel
│   │   │   ├── SquadListView.tsx      # List view for squad
│   │   │   ├── SquadPlayerCard.tsx    # Player card in squad context
│   │   │   ├── PositionGroup.tsx      # Position group with player cards
│   │   │   ├── AddToSquadDialog.tsx   # Add player to squad dialog
│   │   │   ├── SquadExportMenu.tsx    # Export menu (PDF/image/text/WhatsApp/print)
│   │   │   ├── FormationView.tsx      # Football pitch formation overlay
│   │   │   └── FormationSlot.tsx      # Individual formation slot
│   │   ├── players/
│   │   │   ├── PlayersView.tsx        # Main players page orchestrator
│   │   │   ├── PlayerTable.tsx        # Desktop table view
│   │   │   ├── PlayerCard.tsx         # Mobile card view
│   │   │   ├── PlayerFilters.tsx      # Multi-filter panel
│   │   │   ├── PlayerProfile.tsx      # Full player profile
│   │   │   ├── PlayerForm.tsx         # Link-first add player (FPF/ZeroZero auto-scrape + manual fallback)
│   │   │   ├── ObservationNotes.tsx   # Scout notes display + add
│   │   │   ├── StatusHistory.tsx      # Change history log
│   │   │   ├── ZeroZeroData.tsx       # ZeroZero data display — PLANNED
│   │   │   ├── FpfData.tsx            # FPF data display — PLANNED
│   │   │   └── ScoutingReports.tsx    # Extracted reports display — PLANNED
│   │   ├── pipeline/
│   │   │   ├── PipelineView.tsx       # Main pipeline orchestrator
│   │   │   ├── KanbanBoard.tsx        # Desktop Kanban view
│   │   │   ├── StatusColumn.tsx       # Kanban column
│   │   │   ├── PipelineCard.tsx       # Player card in pipeline
│   │   │   └── StatusList.tsx         # Mobile list view
│   │   ├── calendar/
│   │   │   ├── CalendarView.tsx       # Main calendar orchestrator
│   │   │   ├── CalendarGrid.tsx       # Month grid view
│   │   │   ├── CalendarList.tsx       # List view
│   │   │   ├── CalendarExport.tsx     # Calendar export
│   │   │   ├── EventForm.tsx          # Add/edit event form
│   │   │   ├── EventBadge.tsx         # Event type badge
│   │   │   └── PlayerPickerDialog.tsx # Link players to events
│   │   ├── positions/
│   │   │   ├── PositionsView.tsx      # Main positions orchestrator
│   │   │   └── PositionSection.tsx    # Individual position breakdown
│   │   ├── common/
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── OpinionBadge.tsx
│   │   │   ├── PlayerAvatar.tsx       # Avatar with photo or initials
│   │   │   └── MiniPitch.tsx          # Reusable pitch canvas + hover popup (shared by PlayerProfile & PlayerTable)
│   │   └── ui/                        # shadcn/ui components
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser Supabase client
│   │   │   ├── server.ts              # Server-side Supabase client
│   │   │   ├── mappers.ts             # DB row ↔ TypeScript mappers
│   │   │   └── queries.ts             # Database query functions
│   │   ├── utils/
│   │   │   ├── positions.ts           # Position normalization
│   │   │   └── exportSquad.ts         # Squad export utilities
│   │   ├── utils.ts                   # General utilities (cn, etc.)
│   │   ├── validators.ts              # Shared Zod schemas
│   │   ├── constants.ts               # Business rule constants
│   │   └── types/
│   │       └── index.ts               # All TypeScript types
│   └── hooks/
│       ├── useAgeGroup.tsx            # Age group selector hook
│       ├── usePageAgeGroup.tsx        # Per-page age group with localStorage persistence
│       ├── usePlayerProfilePopup.tsx  # DEPRECATED — replaced by navigation to /jogadores/{id}
│       └── useResizableColumns.ts     # Table column resizing
├── scripts/
│   ├── import_initial_data.ts         # One-time JSON → Supabase import (TypeScript)
│   ├── fpf_scraper.py                 # FPF current club scraper — PLANNED
│   ├── zerozero_scraper.py            # ZeroZero stats scraper — PLANNED
│   └── extract_reports.py             # PDF report extraction — PLANNED
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_seed_age_groups.sql
│       ├── 003_fix_rls_recursion.sql
│       ├── 004_squad_ordering.sql
│       ├── 005_scout_update_players.sql
│       ├── 006_fix_recruitment_status_constraint.sql
│       ├── 007_add_meeting_date.sql
│       ├── 008_pipeline_order.sql
│       ├── 009_assinou_status_and_signing_date.sql
│       ├── 010_photo_url.sql
│       ├── 011_calendar_events.sql
│       ├── 012_dc_sub_slots.sql
│       ├── 013_dc_sub_slots_squad.sql
│       ├── 014_zz_photo_url.sql
│       ├── 015_migrate_notes.sql          # Migrate player.notes to observation_notes table
│       ├── 016_multi_position.sql         # Add secondary_position, tertiary_position columns
│       ├── 017_note_delete_rls.sql        # RLS policies for note deletion (admin + author)
│       └── 018_note_priority.sql          # Add priority column to observation_notes
├── data/
│   └── all_players.json               # 1,982 players extracted from Excel
├── docs/
│   ├── SOP.md                         # This document
│   └── report_template.pdf            # Example scouting report PDF
├── package.json
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
  role TEXT NOT NULL CHECK (role IN ('admin', 'master', 'scout', 'scout_externo')),
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
    CHECK (recruitment_status IN ('pool','shortlist','to_observe','target','in_contact','negotiating','confirmed','assinou','rejected')),
  recruitment_notes TEXT,
  meeting_date DATE,                     -- Date of meeting with player/family/agent
  signing_date DATE,                     -- Date player signed (when status = 'assinou')
  pipeline_order INT DEFAULT 0,          -- Manual ordering within pipeline status columns

  -- Squad membership
  is_real_squad BOOLEAN DEFAULT FALSE,   -- Player is at Boavista
  is_shadow_squad BOOLEAN DEFAULT FALSE,
  real_squad_position TEXT               -- Position slot in real squad formation (separate from position_normalized)
    CHECK (real_squad_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR real_squad_position IS NULL),
  shadow_position TEXT                   -- Position slot in shadow squad (may differ from original)
    CHECK (shadow_position IN ('GR','DD','DE','DC','DC_E','DC_D','MDC','MC','MOC','ED','EE','PL') OR shadow_position IS NULL),
  squad_order INT DEFAULT 0,             -- Manual ordering within position groups in squads

  -- Multi-position
  secondary_position TEXT                -- Secondary position (optional)
    CHECK (secondary_position IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR secondary_position IS NULL),
  tertiary_position TEXT                 -- Tertiary position (optional)
    CHECK (tertiary_position IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR tertiary_position IS NULL),

  -- Player media
  photo_url TEXT,                        -- URL to player photo

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
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'importante', 'urgente')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: calendar_events (scouting schedule)
-- ============================================
CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,                       -- Optional time
  event_type TEXT NOT NULL
    CHECK (event_type IN ('observacao', 'jogo', 'reuniao', 'outro')),
  age_group_id INT REFERENCES age_groups(id),
  location TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: calendar_event_players (M2M link)
-- ============================================
CREATE TABLE calendar_event_players (
  event_id INT REFERENCES calendar_events(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, player_id)
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
CREATE INDEX idx_notes_priority ON observation_notes(priority);
CREATE INDEX idx_calendar_date ON calendar_events(event_date);
CREATE INDEX idx_calendar_age_group ON calendar_events(age_group_id);
CREATE INDEX idx_calendar_players_event ON calendar_event_players(event_id);
CREATE INDEX idx_calendar_players_player ON calendar_event_players(player_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE age_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper: roles that can access main app (excludes scout_externo)
-- Used in policies below. scout_externo can only insert players.

-- Everyone authenticated can read (all 4 roles)
CREATE POLICY "read_all_players" ON players FOR SELECT USING (true);
CREATE POLICY "read_all_reports" ON scouting_reports FOR SELECT USING (true);
CREATE POLICY "read_all_history" ON status_history FOR SELECT USING (true);
CREATE POLICY "read_all_notes" ON observation_notes FOR SELECT USING (true);
CREATE POLICY "read_all_age_groups" ON age_groups FOR SELECT USING (true);
CREATE POLICY "read_own_profile" ON profiles FOR SELECT USING (true);
CREATE POLICY "read_all_calendar_events" ON calendar_events FOR SELECT USING (true);
CREATE POLICY "read_all_calendar_event_players" ON calendar_event_players FOR SELECT USING (true);

-- Admin: full write on everything (including DELETE)
CREATE POLICY "admin_full_access_players" ON players FOR ALL USING (
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

-- Master + Scout: can INSERT and UPDATE players, but NOT DELETE
CREATE POLICY "internal_insert_players" ON players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master', 'scout'))
);
CREATE POLICY "internal_update_players" ON players FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master', 'scout'))
);

-- Scout Externo: can only INSERT players (submit new scouted players)
CREATE POLICY "externo_insert_players" ON players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'scout_externo')
);

-- Calendar: admin, master, scout can write
CREATE POLICY "internal_write_calendar" ON calendar_events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master', 'scout'))
);
CREATE POLICY "internal_write_calendar_players" ON calendar_event_players FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master', 'scout'))
);

-- Notes: any authenticated user can insert their own notes
CREATE POLICY "anyone_insert_notes" ON observation_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id
);

-- Notes: admin can delete any note; authors can delete their own notes
CREATE POLICY "admin_delete_notes" ON observation_notes FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "author_delete_own_notes" ON observation_notes FOR DELETE USING (
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
  | 'in_contact' | 'negotiating' | 'confirmed' | 'assinou' | 'rejected';

type DcSubSlot = 'left' | 'right';

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
  meetingDate: string | null;
  signingDate: string | null;
  pipelineOrder: number;
  isRealSquad: boolean;
  isShadowSquad: boolean;
  shadowPosition: PositionCode | null;
  squadOrder: number;
  dcSubSlot: DcSubSlot | null;
  photoUrl: string | null;
}

interface CalendarEvent {
  id: number;
  title: string;
  eventDate: string;
  eventTime: string | null;
  eventType: CalendarEventType;
  ageGroupId: number | null;
  location: string | null;
  notes: string | null;
  createdBy: string;
  players: Player[];            // Linked players (via M2M)
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
  priority: NotePriority;
  createdAt: string;
}

/** Flagged note (for /alertas page) — extends ObservationNote with player info */
interface FlaggedNote extends ObservationNote {
  playerName: string;
  playerPhotoUrl: string | null;
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

### 6.6. In-App Scraping (Server Actions)
The app also scrapes FPF and ZeroZero directly from the browser via server actions in `src/actions/scraping.ts`:

**FPF parsing:** Extracts `var model = {...}` embedded JSON — fields: FullName, CurrentClub, Image, BirthDate, Nationality, PlaceOfBirth.
- **Date formats:** `dd/MM/yyyy`, `yyyy-MM-dd`, Portuguese text (e.g. "27 de março de 2012")
- **Birth country fallback:** If no explicit birth country field, uses Nationality as fallback

**ZeroZero parsing:**
- **Encoding:** ISO-8859-1 for player pages (decoded manually via `TextDecoder`), UTF-8 for autocomplete
- **JSON-LD:** Person schema — image, name, birthDate, nationality, height, weight, worksFor
  - `worksFor` can be string, object, array, or a string containing a JSON array (e.g. `"[{@type:SportsTeam,name:Padroense}]"`) — all formats handled with JSON.parse + regex fallback
- **Sidebar card-data** (most reliable): Position, Foot, DOB, Nome, Clube atual, Nacionalidade, País de Nascimento, Altura, Peso
  - DOB formats: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd`, `yyyy-MM-dd (XX anos)`
- **Header:** Shirt number from `<span class="number">7.</span>`, name from `<h1 class="zz-enthdr-name">`
- **Career table:** Season, club, games, goals per row
- **Captcha detection:** Detects recaptcha redirects and empty/invalid responses, returns clear "blocked" error to user

**Country name normalization:** `normalizeCountry()` fixes common FPF accent issues (e.g. "Guine Bissau" → "Guiné-Bissau"). Applied in all merge points.

**Photo dedup logic:**
- FPF photo only shown if player has NO photo yet — avoids repeatedly asking user to switch
- ZZ photo only shown if URL genuinely changed (vs cached `zz_photo_url`)
- Club logo auto-saved silently, only shown as change if URL genuinely different

**Server actions:**
- `scrapePlayerFpf(playerId)` — scrape FPF for existing player
- `scrapePlayerZeroZero(playerId)` — scrape ZeroZero for existing player
- `scrapePlayerAll(playerId)` — scrape both, merge, return changes (with captcha detection)
- `scrapeFromLinks(fpfLink?, zzLink?)` — scrape from raw URLs (no player needed, for Add Player flow)
- `applyScrapedData(playerId, updates)` — apply selected scraped fields to player
- `autoScrapePlayer(playerId, fpfChanged, zzChanged)` — triggered after profile save if links changed
- `bulkScrapeExternalData(offset, limit, sources)` — batch scrape with rate limiting (2-4s delay)

**Merge priority:** FPF for name/DOB/nationality/birthCountry, ZeroZero for position/foot/height/weight/photo/shirt number. Club: FPF priority, then ZZ.

**Observation notes:** Imported notes (no `author_id`) show player's `referred_by` name instead of "Importado".

---

## 7. UX & Interface

### 7.1. Design Principles
- **Mobile-first** — scouts use their phone at the field
- **Simple and clean** — minimum clicks for common actions
- **Team identity** — Boavista FC colors: black and white/checkered as brand identity
- **Immediate feedback** — toast notifications for actions
- **Portuguese throughout** — all labels, buttons, messages in PT-PT

### 7.2. Mobile Navigation (Bottom Tabs — 6 tabs)
1. **Jogadores** (Users icon) — Player database
2. **Plantel** (ShieldCheck icon) — Real squad
3. **Sombra** (Shield icon) — Shadow squad
4. **Abordagens** (GitBranch icon) — Recruitment pipeline
5. **Prioritarias** (Bell icon) — Flagged notes inbox (`/alertas`). Shows red badge (urgent count) + yellow badge (important count).
6. **Mais** (Menu icon) — Calendar, Import, Export, Admin (Utilizadores)

### 7.3. Desktop Navigation (Sidebar)
- Jogadores
- Planteis (Real squad)
- Planteis Sombra (Shadow squad)
- Abordagens (Pipeline)
- Calendario
- Notas Prioritarias (Bell icon) — with red badge (urgent count) + yellow badge (important count)
- **Admin section:**
  - Definicoes
  - Importar — planned
  - Exportar — planned
  - Utilizadores — planned

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

### 8.3. Internal Scout at the Field (Mobile)
1. Open app on phone
2. Jogadores → + Novo (Add New)
3. Fill: name, position, club, date of birth
4. Optionally paste FPF link
5. Save → player appears with status "pool" for admin to review

### 8.5. External Scout Submission
1. Open app on phone (logged in as scout_externo)
2. Automatically lands on `/submeter`
3. Fill: name, position, club, date of birth, foot, notes
4. Save → player appears with status "pool", `created_by` = this scout
5. Form resets for next submission — no access to other pages

### 8.4. Update External Data (Weekly/Monthly)
1. Run `fpf_scraper.py` in terminal
2. Run `zerozero_scraper.py` in terminal
3. Run `extract_reports.py` for new reports
4. Data updates directly in Supabase
5. Dashboard shows alerts for club changes

---

## 9. Development Phases

### Phase 1 — Foundation (MVP) ✅ COMPLETE
Build the core app that replaces the spreadsheet.

- [x] Setup Supabase project (database, auth, RLS policies)
- [x] Setup Next.js 16 with App Router + TypeScript + Tailwind v4 + shadcn/ui
- [x] Authentication: login page, session management, role-based access
- [x] Age group selector (persistent across pages via localStorage + context)
- [x] JSON import script (`scripts/import_initial_data.ts`) — imports from `all_players.json`
- [x] Player database: table (desktop) + card list (mobile), search, filters, sorting
- [x] Player profile page: all basic data, report labels, external link buttons
- [x] Color coding by department opinion
- [x] Add new player form (mobile-optimized)
- [x] Deploy to Vercel
- [x] SQL migrations (001 schema + 002 seed age groups)
- [x] ~~In-app Excel import~~ — not needed, handled by `import_initial_data.ts` script
- [x] ~~Seed data~~ — handled by `full_reset.py` script

**Deliverable:** Working app where users can log in, browse players, search/filter, view profiles.

### Phase 2 — Planning & Recruitment ✅ COMPLETE
Add the core planning tools.

- [x] Real Squad vs Shadow Squad view (the PRIMARY planning page) with compare, real-only, shadow-only sub-routes
- [x] Shadow squad management: add/remove, assign shadow position, manual ordering
- [x] Real squad management: mark players as "at Boavista", manual ordering
- [x] Position view: all 10 positions with real/shadow/pool breakdown
- [x] Recruitment pipeline: status management with Kanban board on all screens (horizontal desktop, vertical mobile), DnD, manual ordering
- [x] Status change with automatic history logging
- [x] Observation notes (scout feature) with priority system (normal/importante/urgente)
- [x] Note deletion (admin or author) with confirmation dialog
- [x] Dashboard: counters, position coverage, recent changes
- [x] Formation view: football pitch graphic with position slots, conditional rendering for DnD
- [x] Squad export: PDF, image, text, WhatsApp, print
- [x] DC sub-slots for left/right central defenders
- [x] Calendar: scouting schedule with events, player linking, month/list views
- [x] Player photos (photo_url + avatar component)
- [x] Player table redesign: eval column, photos, position pitch hover, row click navigation
- [x] Shared MiniPitch component (pitch canvas + hover popup)
- [x] StatusHistory: squad context labels, opinion pill display
- [x] "Assinou" recruitment status + signing date
- [x] Meeting date tracking
- [x] Player profile popup (inline view without page navigation)
- [x] Player profile export (PNG image + print) with cross-origin image proxy
- [x] Multi-position support (primary/secondary/tertiary with color-coded display)
- [x] Flagged notes page (`/alertas`) with navigation badges
- [x] "Mais" overflow page for mobile

**Deliverable:** Full planning workflow — scouts and admins can manage the recruitment process.

### Phase 3 — External Data & Reports ✅ COMPLETE
Enrich player profiles with external data.

- [x] Setup Google Cloud Service Account + Drive API credentials
- [x] `extract_reports.py`: download PDFs from Google Drive, parse template with pdfplumber, insert structured data into `scouting_reports` table
  - Position-based Y-coordinate extraction for accurate two-column PDF layout parsing
  - Handles multiple scout templates (Afonso Pedrosa, Rúben Andrade, Rafael Coelho, Isaque Mendes, Diogo Encarnação, Daniel Azevedo, etc.)
  - Smart line merging preserves newlines between distinct points, merges mid-sentence line wraps
  - English date fallback for garbled PDF dates
  - Tested on 100+ reports with 99%+ accuracy
- [x] Display extracted reports on player profile (chronological, expandable cards) — `ScoutingReports.tsx`
  - Report cards with rating circles, decision badges, match/scout info
  - Detail dialog with assessment blocks (physical, strengths, weaknesses), player pills, PDF link
- [x] ~~Rating evolution chart~~ — not needed (user decision)
- [x] FPF scraper built into `full_reset.py`: scrape current club from FPF pages, update `fpf_current_club`
- [x] ~~FpfData.tsx~~ — not needed, club verification already in refresh dialog
- [x] ZeroZero link field on player profile — already implemented in refresh dialog + add player flow
- [x] ZeroZero scraper built into `full_reset.py`: scrape stats/history from ZeroZero, update `zz_*` fields
- [x] ~~ZeroZeroData.tsx~~ — deferred indefinitely (ZZ blocks scrapes); data already saved in player fields via refresh dialog
- [x] ~~Dashboard club change alerts~~ — not needed, flagged notes cover this use case
- [x] Link-first Add Player flow — paste FPF/ZeroZero URLs, auto-scrape name/DOB/club/position/foot/shirt number/photo/height/weight/nationality, review & save
- [x] Duplicate detection on player creation (FPF link, ZeroZero link, name+DOB)
- [x] Delete player (admin only) with confirmation dialog + cascade delete of related data
- [x] ZeroZero scraping fixes: club from JSON-LD string, sidebar name extraction, DOB yyyy-MM-dd format
  - `scrapeFromLinks()` server action: scrapes both sources without needing a player ID
  - DOB + name extraction added to both FPF (`var model`) and ZeroZero (JSON-LD + HTML sidebar) scrapers
  - Merge logic: FPF priority for name/nationality, ZeroZero for position/foot/height/weight/photo
  - Manual entry fallback when no external links available
- [x] Fix: player click in squad/pipeline views now navigates to `/jogadores/{id}` instead of showing stale popup
- [x] Fix: opinion badges overflow in add-to-squad/pipeline dialogs — show single primary badge inline with name
- [x] ZeroZero auto-link finder: multi-strategy autocomplete search (first+second+last, first+last, first+second-to-last, surname) with DOB verification on candidate profile page — eliminates false positives
- [x] Refresh player dialog redesign: FPF vs ZZ data separation, ZZ confirmation box (amber/green), photo picker (FPF/ZZ), club logo as confirmable change
- [x] Anti-blocking for ZeroZero scraping: rotating User-Agents, realistic browser headers, human-like delays
- [x] Admin can edit observation notes inline (pencil icon on hover)
- [x] "Logo errado? Remover" feature in ClubBadge hover card
- [x] Player table: card-style rating badge (matching PlayerProfile), resizable columns with double-click auto-fit, observation notes column with bullet-point previews
- [x] Fix: hydration mismatch in resizable columns (localStorage loaded after mount)

**Deliverable:** Enriched player profiles with scouting reports, current club verification, and match statistics.

### Phase 4 — Polish & Export ✅ COMPLETE
Final refinements.

- [x] Squad export: PDF, image, text, WhatsApp, print (done in Phase 2)
- [x] Player profile export as image/print (done in Phase 2)
- [x] Export page (`/exportar`) — Excel (filtered), PDF (filtered), JSON (full DB backup) with shared filter UI
- [x] Dashboard with core metrics (done in Phase 2)
- [x] Mobile optimizations: iPhone landscape DnD fix, touch sensors with activation constraints, conditional rendering for responsive layouts
- [x] Role system: 3 roles (admin, editor, scout) — DB migration (022, 023) + middleware route protection + UI guards (canEdit vs isAdmin)
- [x] User management page (`/admin/utilizadores`) — invite via email, role dropdown, search (fuzzy by name/email/role), soft delete (deactivate/reactivate)
- [x] Invite flow: Supabase Auth invite → `/auth/confirm` token exchange → `/definir-password` set password page
- [x] Scout report submission (`/submeter`) — FPF auto-scrape, ZZ auto-find with confirmation, evaluation form, inline validation
- [x] My reports page (`/meus-relatorios`) — scout's own reports with detail view
- [x] Admin report review (`/admin/relatorios`) — approve (creates player) / reject, pending count badge, status filter tabs
- [x] Scout report → scouting_reports integration — approved reports saved as proper scouting reports on the player
- [x] Dynamic age groups — auto-calculated from current date (season starts July 1), Sénior for players above Sub-19
- [x] Dynamic season — `CURRENT_SEASON` computed from date, no manual updates needed
- [x] Theme system — 10 themes (8 light + 2 dark) with different color palettes and fonts (Inter, DM Sans, Space Grotesk), stored per-device in localStorage, anti-FOUC script, `/preferencias` page accessible to all roles
- [x] PWA setup — installable on phone (manifest.json + icons + minimal service worker), no offline caching

**Deliverable:** Production-ready application.

### Phase 5 — Mobile UX & New Features ⬚ PLANNED

Post-launch improvements based on real usage feedback.

#### 5A. Mobile UX Overhaul
The app is mobile-first but the current iPhone experience needs significant improvement.

**Status: DONE for admin/editor roles.** Remaining: scout role pages (submissions, limited player views) — not yet confirmed/designed.

- [x] **Bottom navigation redesign** — hamburger drawer replaces bottom tab bar
- [x] **Full mobile UX audit (admin/editor)** — completed across all features:
  - ~~Player table/list scrolling and interaction~~ DONE
  - ~~Player profile layout on small screens~~ DONE
  - ~~Squad/formation view touch interactions~~ DONE
  - ~~Pipeline kanban on mobile~~ DONE
  - ~~Filter panels and dropdowns~~ DONE
  - ~~Form inputs (add player, submit report, etc.)~~ DONE
  - ~~Dialog/modal sizing and scrolling~~ DONE
  - ~~Export page layout~~ DONE
- [ ] **Scout role mobile UX** — design and polish scout-specific pages (submissions list, limited player views, report submission flow)
- [x] **Player profile mobile revamp** — MiniPitch below photo (clickable popup), position badges, personal rating in header, shortened name, InfoChip-based Info Basica, Section visual revamp (accent pill + separator), observer avatars, DecisionBadge, action bar icon-only on mobile, FPF/ZZ links in Info Basica title
- [x] **Player profile edit mode revamp** — custom mobile-first edit inputs: shirt number with icon, interactive foot selector (SVG silhouettes), phone input with country code prefix (+351 default) and validation, referral picker (CommandDialog combobox linking to user profiles via `referred_by_user_id`), LinkCard components for FPF/ZZ/photo URLs (tap-to-expand inline editing, image URL validation with loading state), uniform text styling across all fields, action bar (X cancel / Guardar save), delete confirmation requiring "ELIMINAR" typed, zona de perigo section (admin only), dirty state detection (Guardar disabled until changes made), pinch-to-zoom disabled app-wide
- [x] **Scout evaluations popup revamp** — bottom sheet with drag handle, scrollable, grouped sections (Tu/Relatorios/Scouts), accent strip rows with avatar + inline stars + rating number
- [x] **OpinionBadge compact variant** — tinted border + text style for header (mobile + desktop)
- [x] **RecruitmentCard** — mini pipeline progress tracker with step dots, status icon circle, integrated date display (treino/reuniao/assinatura), status descriptions
- [x] **RefreshPlayerButton** — unified button styling matching action bar
- [x] **"Recusou vir"** — renamed "Rejeitado" label to clarify it means the player refused
- [x] **Admin reports revamp** (`/admin/relatorios`) — complete redesign with 3 tab sub-pages:
  - Relatórios: KPI cards, highlight chips, searchable/filterable/sortable list, inline tag buttons, slide-over detail panel, URL pagination
  - Scouts: activity heatmap (365-day), per-scout stats with sparklines
  - Consenso: multi-scout divergence cards with severity badges, position/club from players table, dismiss to localStorage, masonry layout (1-5 cols)

#### 5B-0. Player Club History & Season Stats

Secção "Percurso" no perfil do jogador — mostra o histórico de clubes e stats por época, estilo ZeroZero. Combina dados de duas fontes (FPF + ZeroZero) num timeline unificado.

**Dados existentes:**
- `zz_team_history` — array de `{ club, season, games, goals }` scraped do ZeroZero (já existe no DB)
- `fpf_current_club` — clube actual na FPF (já existe)

**Dados a adicionar (scraping melhorado):**
- **FPF club history** — a FPF tem o histórico de clubes do jogador (registos de transferência). Scraper deve extrair lista de clubes + épocas.
- **Merge FPF + ZZ** — FPF é source of truth para clubes/transferências, ZZ para stats (jogos, golos). Merge por época + clube.

**Data model:**
```sql
-- Unified club history (merged from FPF + ZZ sources)
-- Stored as JSONB array on players table (like zz_team_history)
ALTER TABLE players ADD COLUMN club_history JSONB;
-- Structure: [{ season, club, club_logo_url, competition, games, goals, assists, source }]
-- source: 'fpf', 'zz', 'merged' (when both match)
```

**Merge logic:**
1. Start with FPF entries (authoritative for club/season)
2. Match ZZ entries by season + club name (fuzzy: "Leixões" = "Leixões S.C.")
3. When matched → merge stats (games, goals from ZZ) into FPF entry, mark `source: 'merged'`
4. ZZ entries with no FPF match → add as `source: 'zz'` (might be sub-teams, cups, etc.)
5. FPF entries with no ZZ match → add as `source: 'fpf'` (games/goals unknown)

**Scraper improvements:**
- [ ] FPF scraper: extract club history (list of clubs + seasons) in addition to current club
- [ ] ZZ scraper: fix malformed seasons (`2024/20` → should be `2024/25` or discarded)
- [ ] ZZ scraper: extract assists if available
- [ ] ZZ scraper: extract competition name (e.g. "Jun.C S15") for context
- [ ] Merge script: combine FPF + ZZ data into `club_history` column

**UI — "Percurso" section in player profile:**
- Table layout like ZeroZero screenshot: Época | Equipa | J | G | (A)
- Club logo/flag next to club name (if available)
- Competition/team tier in smaller text below club name (e.g. "[Jun.C S15]")
- Most recent season first
- Seasons with 0 games shown in muted style
- Collapsible if more than 6 entries (show 5 + "Ver mais")
- Source indicator: subtle dot or icon showing if data is from FPF, ZZ, or both

**Sub-phases:**
- **5B0-1:** Improve ZZ scraper (fix seasons, extract competition/assists)
- **5B0-2:** Improve FPF scraper (extract club history, not just current club)
- **5B0-3:** Merge script + `club_history` column
- **5B0-4:** "Percurso" section UI in player profile

#### 5B. YouTube Media Links

Secção de media no perfil do jogador. Centraliza vídeo e scouting no mesmo sítio — dá contexto visual, facilita análise técnica/física, útil em reuniões e comparação de atletas.

**Data model:**
```sql
CREATE TABLE player_videos (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  url TEXT NOT NULL,                      -- YouTube URL (youtube.com or youtu.be)
  title TEXT,                             -- Auto-extracted from YouTube oEmbed API
  thumbnail_url TEXT,                     -- Auto-extracted thumbnail
  added_by UUID REFERENCES profiles(id),
  added_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_player_videos_player ON player_videos (club_id, player_id);
```

**Validation:** Only accept `youtube.com/watch?v=` and `youtu.be/` URLs. Reject all others.

**Auto-extraction:** On submit, call YouTube oEmbed API (`https://www.youtube.com/oembed?url=...&format=json`) server-side to fetch title + thumbnail. No API key needed — oEmbed is public.

**Player profile — "Media" section:**
- Grid of video cards (2 columns mobile, 3 desktop)
- Each card: thumbnail image + title + date added + who added
- Tap card → expands to inline YouTube embed (`iframe` with `youtube-nocookie.com` for privacy)
- Watch video without leaving the app
- Admin/editor: "Adicionar Vídeo" button → URL input + auto-preview
- Admin: remove video (with confirmation)

**Player comparison (Phase 12):** If both players have videos, show video count in comparison. Quick access to watch side by side.

**Sub-phases:**
- **5B-1:** `player_videos` table + RLS + Server Action (add/remove)
- **5B-2:** oEmbed extraction (title + thumbnail)
- **5B-3:** "Media" section in player profile (cards + inline embed)

#### 5C. Tactical Formations per Age Group

Cada escalão pode usar um sistema tático diferente — nem todos jogam no mesmo formato. O admin escolhe a formação e os plantéis real/sombra adaptam-se.

**Data model:**
```sql
-- Per escalão, per squad type — real and shadow can use different formations
ALTER TABLE club_age_groups ADD COLUMN real_formation TEXT DEFAULT '4-3-3';
ALTER TABLE club_age_groups ADD COLUMN shadow_formation TEXT DEFAULT '4-3-3';
```

**Supported formations (initial):**

| Formation | Slots |
|-----------|-------|
| `4-3-3` | GR, DD, DC, DC, DE, MC, MC, MC, ED, EE, PL |
| `4-4-2` | GR, DD, DC, DC, DE, MC, MC, ED, EE, PL, PL |
| `3-5-2` | GR, DC, DC, DC, DD, DE, MC, MC, MOC, PL, PL |
| `4-2-3-1` | GR, DD, DC, DC, DE, MDC, MDC, ED, MOC, EE, PL |
| `4-4-1-1` | GR, DD, DC, DC, DE, MC, MC, ED, EE, MOC, PL |
| `3-4-3` | GR, DC, DC, DC, DD, DE, MC, MC, ED, EE, PL |

Mais formações podem ser adicionadas — cada uma é só uma lista de position slots.

**Formation selector:**
- Dropdown in squad view header, next to escalão selector
- Separate selectors for plantel real and plantel sombra
- Changing formation re-maps existing players to new slots where possible (same position stays, mismatched positions get unassigned)
- Confirmation dialog if changing formation would unassign players

**Dynamic pitch layout:**
- MiniPitch/FieldView adapts positions to the chosen formation
- Pitch shows the formation shape (e.g. 4-3-3 diamond vs 4-4-2 flat)
- Each slot is tappable to assign/remove player
- Empty slots show "+" with position label

**Benefits:**
- Cada escalão configurado de forma independente
- Melhora a leitura tática do plantel
- Ajuda no planeamento e construção de equipas
- Real e sombra podem ter formações diferentes (ex: real joga 4-3-3, sombra construída para 4-4-2)

**Sub-phases:**
- **5C-1:** Formation data on `club_age_groups` + formation slot definitions in constants
- **5C-2:** Formation selector dropdown in squad view
- **5C-3:** Dynamic pitch layout rendering per formation
- **5C-4:** Player re-mapping logic when formation changes

**Deliverable:** Polished mobile experience, video-enriched player profiles, tactical flexibility per escalão.

---

### Phase 6 — Multi-Tenant (Multi-Club Platform)

Transform Eskout from a single-club tool into a multi-club SaaS platform. Every club gets its own isolated environment under `app.eskout.co`. A superadmin panel manages the business side (clubs, users, features). Club data is fully private — not even the superadmin can see player/scouting data.

#### 6.1. Architecture Overview

**Tenancy model:** Row-level isolation via `club_id` foreign key on all data tables. Supabase RLS policies enforce isolation at the database level — no application-level trust.

**URL strategy:** Single domain `app.eskout.co` for all clubs. No subdomains. After login, users with multiple clubs see a club picker. Selected club stored in cookie (`eskout-club-id`). Switcher available in sidebar/header.

**Role layers:**
| Layer | Role | Scope | Description |
|-------|------|-------|-------------|
| Platform | `superadmin` | Global | Manages clubs, invites club admins, toggles features. Cannot see club player/scouting data. |
| Club | `admin` | Per club | Full CRUD within their club. Manages users, escalões, settings. |
| Club | `editor` | Per club | Edit players/pipeline/squads/calendar. Cannot delete. |
| Club | `scout` | Per club | View all, add players, add notes, submit reports. |

A user can be `superadmin` AND `admin` of a specific club simultaneously. A user can have different roles in different clubs (e.g. editor at Lourosa, scout at Sporting).

#### 6.2. Database Schema Changes

**New tables:**

```sql
-- Clubs
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- "Boavista FC"
  slug TEXT UNIQUE NOT NULL,             -- "boavista" (URL-friendly, immutable)
  logo_url TEXT,                         -- Club crest URL
  settings JSONB DEFAULT '{}',           -- Club-specific config (branding, preferences)
  features JSONB DEFAULT '{}',           -- Feature toggles: {"pipeline": true, "calendar": false, ...}
  limits JSONB DEFAULT '{}',             -- Future: {"max_users": 20, "max_players": 5000}
  is_active BOOLEAN DEFAULT true,        -- Superadmin can deactivate a club
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Club memberships (replaces role on profiles)
CREATE TABLE club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'scout')),
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, club_id)             -- One role per club per user
);

-- Club-specific age groups (replaces global age_groups)
CREATE TABLE club_age_groups (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Sub-14"
  generation_year INT NOT NULL,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, name, season)
);
```

**Modified tables — add `club_id`:**

Every data table gets a `club_id UUID NOT NULL REFERENCES clubs(id)`:
- `players` — add `club_id`, update all indexes
- `scouting_reports` — add `club_id`
- `observation_notes` — add `club_id`
- `status_history` — add `club_id`
- `calendar_events` — add `club_id`
- `scout_evaluations` — add `club_id`
- `scout_reports` (submissions) — add `club_id`

**Modified tables — profiles:**

```sql
-- Add superadmin flag to profiles (global, not per-club)
ALTER TABLE profiles ADD COLUMN is_superadmin BOOLEAN DEFAULT false;

-- Remove role from profiles (now in club_memberships)
-- Keep for backwards compat during migration, then drop
```

#### 6.3. RLS Policies

**Core principle:** Every data query is filtered by `club_id` matching the user's active club from their JWT/session. The superadmin flag grants access to `clubs` and `club_memberships` tables only — NOT to player data.

```sql
-- Example: players table
CREATE POLICY "Users see only their club's players"
  ON players FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins/editors can insert players in their club"
  ON players FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'editor', 'scout')
    )
  );

-- Superadmin panel tables — only superadmins
CREATE POLICY "Only superadmins manage clubs"
  ON clubs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- Club memberships — superadmins + club admins
CREATE POLICY "Club admins manage their club memberships"
  ON club_memberships FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
    OR
    (club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin'
    ))
  );
```

**Critical:** Superadmin has NO select/insert/update/delete policy on `players`, `scouting_reports`, `observation_notes`, etc. — unless they also have a `club_membership` for that club.

#### 6.4. Authentication & Club Context Flow

```
1. User logs in (email + password, normal Supabase Auth)
2. App fetches club_memberships for user
3. If 0 clubs → "Sem clube associado" message
4. If 1 club → auto-select, redirect to dashboard
5. If 2+ clubs → club picker screen (logo + name for each)
6. Selected club_id stored in cookie (eskout-club-id)
7. All server queries read club_id from cookie + verify membership
8. Sidebar shows club logo + name, switcher button to change club
```

**Superadmin detection:** After login, if `profiles.is_superadmin = true`, show "Gestão Eskout" as an extra option in the club picker (or always-visible in sidebar). Clicking it navigates to `/master`.

#### 6.5. Superadmin Panel (`/master`)

Protected by middleware — only `is_superadmin = true` can access `/master/*` routes.

**Pages:**

| Route | Description |
|-------|-------------|
| `/master` | Dashboard: total clubs, total users, active clubs, recent activity |
| `/master/clubes` | List all clubs (name, logo, status, user count, created date). Create new club. |
| `/master/clubes/[id]` | Club detail: settings, feature toggles, member list, invite admin, activate/deactivate |
| `/master/utilizadores` | All platform users across all clubs (name, email, memberships). Cannot see player data. |

**Club creation flow:**
1. Superadmin creates club: name, slug, logo
2. Superadmin invites first admin by email
3. Invited user receives email → creates account (or links existing) → joins club as admin
4. Club admin configures: escalões, squad settings, invites editors/scouts

**Feature toggles (per club):**
Stored as JSONB on `clubs.features`. Initial toggleable features:

| Feature Key | Label | Default | Description |
|-------------|-------|---------|-------------|
| `pipeline` | Pipeline | `true` | Recruitment pipeline (Kanban) |
| `calendar` | Calendário | `true` | Calendar events |
| `shadow_squad` | Plantel Sombra | `true` | Shadow squad functionality |
| `scouting_reports` | Relatórios | `true` | PDF scouting reports |
| `scout_submissions` | Submissões Scout | `true` | Scout player submission flow |
| `export` | Exportar | `true` | Excel/PDF/JSON export |
| `positions_view` | Vista Posições | `true` | Position-by-position page |
| `alerts` | Alertas | `true` | Priority notes / alerts page |

When a feature is disabled, the corresponding nav item is hidden and the route returns 404.

#### 6.6. Club Context in Application

**Middleware changes:**
- Read `eskout-club-id` from cookie on every request
- Verify user has `club_membership` for that `club_id`
- Inject `club_id` into request context (header or cookie)
- `/master/*` routes: verify `is_superadmin` instead
- No club cookie + not superadmin → redirect to club picker

**Server Actions / Queries:**
- Every query receives `club_id` from context (not from client)
- Server-side helper: `getActiveClub()` → reads cookie, verifies membership, returns `{ clubId, role, club }`
- All existing queries add `.eq('club_id', clubId)` filter
- Insert operations auto-set `club_id` from context

**Client-side:**
- `useClub()` hook: returns active club (name, logo, features, role)
- Feature gate component: `<Feature name="pipeline">{children}</Feature>` — renders nothing if disabled
- Sidebar/MobileDrawer: show club logo + name, feature-gated nav items

#### 6.7. Club Branding & Settings

**`clubs.settings` JSONB structure:**
```json
{
  "primary_color": "#1a1a1a",         -- Optional accent color override
  "display_name": "Boavista FC",       -- Shown in header/sidebar
  "country": "PT",                     -- Default country code for phone inputs
  "default_season": "2025/2026"        -- Active season
}
```

**UI:** Club logo appears in sidebar header (small, next to "Eskout" branding). Mobile drawer shows club logo prominently. Login/club picker shows each club's crest.

#### 6.8. User Invitation Flow

**Club admin invites user:**
1. Admin goes to club settings → Utilizadores → Convidar
2. Enters email + role (admin/editor/scout)
3. System checks if email already has a profile:
   - Yes → creates `club_membership` immediately, user sees new club on next login
   - No → sends invite email with signup link, pre-creates pending membership
4. Invited user signs up → membership activates → lands in club

**Superadmin invites club admin:**
Same flow but from `/master/clubes/[id]` → always role `admin`.

#### 6.9. Migration Strategy

Existing data will be wiped (test data only), but the current schema stays. Incremental SQL migrations extend the structure — same pattern as migrations 001-028.

**Migrations (added per sub-phase):**
- **029** — Create `clubs`, `club_memberships`, `club_age_groups` tables
- **030** — Add `club_id` to `players`, `scouting_reports`, `observation_notes`, `status_history`, `calendar_events`, `scout_evaluations`, `scout_reports`. Add `is_superadmin` to `profiles`.
- **031** — New RLS policies (club-scoped reads/writes, superadmin-only on `clubs`/`club_memberships`)
- **032+** — As needed per sub-phase (feature toggles defaults, invitation tables, etc.)

**Application changes (in order):**
1. Update all Server Actions to use `getActiveClub()` helper
2. Update all queries to filter by `club_id`
3. Add middleware club context logic (cookie-based)
4. Build `/master` panel pages
5. Build club picker + switcher UI
6. Feature gate all nav items and routes
7. Create first club (Boavista) + assign existing users

**Estimated scope:** This is a significant refactor touching every query, action, and data-fetching component. Recommend doing it in sub-phases:
- **6A:** Schema + RLS + auth context (backend foundation)
- **6B:** Superadmin panel (`/master` pages)
- **6C:** Club picker + switcher + branding UI
- **6D:** Feature toggles + route gating
- **6E:** Invitation system

Each sub-phase must be deployable independently.

**Deliverable:** Eskout as a multi-club SaaS platform. Each club has fully isolated data, configurable features, and independent user management. Superadmin manages the business without accessing club-private data.

---

### Phase 7 — Internationalization (i18n)

Full UI translation support. Every label, button, placeholder, error message, toast, status name, position code, and domain term is translatable. User-generated content (notes, reports, player names) stays in the original language.

#### 7.1. Architecture

**Library:** `next-intl` — the standard for Next.js App Router i18n. Supports Server Components, client components, and middleware-based locale detection.

**Locales (initial):**
| Code | Language |
|------|----------|
| `pt` | Português (PT-PT) — default |
| `en` | English |
| `fr` | Français |
| `es` | Español |

Adding a new language = creating a new JSON file + translating. No code changes needed.

**Locale resolution (priority order):**
1. User preference (stored in `profiles.locale`)
2. Club default locale (stored in `clubs.settings.default_locale`)
3. Browser `Accept-Language` header
4. Fallback: `pt`

**No URL prefix.** Locale is per-user preference, not part of the URL. `app.eskout.co/jogadores` stays the same regardless of language. This avoids breaking existing routes and keeps URLs clean.

#### 7.2. Translation File Structure

```
src/
├── messages/
│   ├── pt.json          -- Portuguese (source of truth)
│   ├── en.json          -- English
│   ├── fr.json          -- French
│   └── es.json          -- Spanish
```

**Namespace structure within each JSON:**

```json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "edit": "Editar",
    "delete": "Eliminar",
    "search": "Pesquisar",
    "filters": "Filtros",
    "loading": "A carregar...",
    "confirm": "Confirmar",
    "back": "Voltar",
    "close": "Fechar",
    "yes": "Sim",
    "no": "Não",
    "error": "Erro",
    "success": "Sucesso"
  },
  "nav": {
    "dashboard": "Painel",
    "squad": "Plantel",
    "players": "Jogadores",
    "pipeline": "Pipeline",
    "calendar": "Calendário",
    "positions": "Posições",
    "alerts": "Alertas",
    "settings": "Definições",
    "export": "Exportar",
    "users": "Utilizadores"
  },
  "positions": {
    "GR": { "short": "GR", "long": "Guarda-Redes" },
    "DD": { "short": "DD", "long": "Defesa Direito" },
    "DE": { "short": "DE", "long": "Defesa Esquerdo" },
    "DC": { "short": "DC", "long": "Defesa Central" },
    "MDC": { "short": "MDC", "long": "Médio Defensivo" },
    "MC": { "short": "MC", "long": "Médio Centro" },
    "MOC": { "short": "MOC", "long": "Médio Ofensivo" },
    "ED": { "short": "ED", "long": "Extremo Direito" },
    "EE": { "short": "EE", "long": "Extremo Esquerdo" },
    "PL": { "short": "PL", "long": "Ponta de Lança" }
  },
  "opinions": {
    "1a_escolha": "1ª Escolha",
    "2a_escolha": "2ª Escolha",
    "acompanhar": "Acompanhar",
    "por_observar": "Por Observar",
    "urgente_observar": "Urgente Observar",
    "sem_interesse": "Sem interesse",
    "potencial": "Potencial",
    "assinar": "Assinar"
  },
  "pipeline_status": {
    "por_tratar": "Por Tratar",
    "a_observar": "A Observar",
    "em_contacto": "Em Contacto",
    "vir_treinar": "Vir Treinar",
    "reuniao_marcada": "Reunião Marcada",
    "a_decidir": "A Decidir",
    "confirmado": "Confirmado",
    "assinou": "Assinou",
    "rejeitado": "Recusou Vir"
  },
  "observer_eval": {
    "duvida": "2 - Dúvida",
    "bom": "3 - Bom",
    "muito_bom": "4 - Muito Bom",
    "excelente": "5 - Excelente"
  },
  "observer_decision": {
    "assinar": "Assinar",
    "acompanhar": "Acompanhar",
    "rever": "Rever",
    "sem_interesse": "Sem Interesse"
  },
  "foot": {
    "Dir": { "short": "Dir", "long": "Direito" },
    "Esq": { "short": "Esq", "long": "Esquerdo" },
    "Amb": { "short": "Amb", "long": "Ambidestro" }
  },
  "player": {
    "name": "Nome",
    "club": "Clube",
    "position": "Posição",
    "age_group": "Escalão",
    "dob": "Data Nascimento",
    "foot": "Pé",
    "shirt_number": "Número",
    "contact": "Contacto",
    "nationality": "Nacionalidade",
    "birth_country": "País Nascimento",
    "height": "Altura",
    "weight": "Peso",
    "referred_by": "Referenciado por",
    "notes": "Notas",
    "strengths": "Pontos Fortes",
    "weaknesses": "Pontos Fracos",
    "rating": "Avaliação",
    "decision": "Decisão",
    "observer": "Observador",
    "scouting_report": "Relatório Observação",
    "status": "Estado",
    "add_player": "Adicionar Jogador",
    "profile": "Ficha do Jogador"
  },
  "squad": {
    "real_squad": "Plantel Real",
    "shadow_squad": "Plantel Sombra",
    "add_to_shadow": "Adicionar ao Plantel Sombra",
    "remove_from_shadow": "Remover do Plantel Sombra"
  },
  "calendar": {
    "training": "Treino",
    "signing": "Assinatura",
    "meeting": "Reunião",
    "observation": "Observação",
    "other": "Outro"
  },
  "roles": {
    "admin": "Administrador",
    "editor": "Editor",
    "scout": "Observador"
  },
  "priority": {
    "normal": "Normal",
    "importante": "Importante",
    "urgente": "Urgente"
  }
}
```

This is not exhaustive — every hardcoded Portuguese string in the codebase needs a translation key. The `pt.json` file is the source of truth; other locale files mirror its structure.

#### 7.3. Domain Terms Translation Reference

Position codes (`GR`, `DC`, etc.) are internal identifiers that never change. The **display names** are translated:

| Code | PT | EN | FR | ES |
|------|----|----|----|----|
| GR | Guarda-Redes | Goalkeeper | Gardien | Portero |
| DD | Defesa Direito | Right Back | Arrière Droit | Lateral Derecho |
| DE | Defesa Esquerdo | Left Back | Arrière Gauche | Lateral Izquierdo |
| DC | Defesa Central | Centre Back | Défenseur Central | Defensa Central |
| MDC | Médio Defensivo | Defensive Mid | Milieu Défensif | Mediocentro Defensivo |
| MC | Médio Centro | Central Mid | Milieu Central | Centrocampista |
| MOC | Médio Ofensivo | Attacking Mid | Milieu Offensif | Mediapunta |
| ED | Extremo Direito | Right Winger | Ailier Droit | Extremo Derecho |
| EE | Extremo Esquerdo | Left Winger | Ailier Gauche | Extremo Izquierdo |
| PL | Ponta de Lança | Striker | Attaquant | Delantero |

| Opinion | PT | EN | FR | ES |
|---------|----|----|----|----|
| 1ª Escolha | 1ª Escolha | 1st Choice | 1er Choix | 1ª Elección |
| 2ª Escolha | 2ª Escolha | 2nd Choice | 2ème Choix | 2ª Elección |
| Acompanhar | Acompanhar | Monitor | Suivre | Seguir |
| Por Observar | Por Observar | To Observe | À Observer | Por Observar |
| Urgente Observar | Urgente Observar | Urgent Observe | Urgent à Observer | Urgente Observar |
| Sem interesse | Sem interesse | No Interest | Sans Intérêt | Sin Interés |
| Potencial | Potencial | Potential | Potentiel | Potencial |
| Assinar | Assinar | Sign | Signer | Fichar |

| Foot | PT | EN | FR | ES |
|------|----|----|----|----|
| Dir | Direito | Right | Droit | Derecho |
| Esq | Esquerdo | Left | Gauche | Izquierdo |
| Amb | Ambidestro | Both | Ambidextre | Ambidiestro |

**Short codes (badges, filters, pitch labels) — also translated:**

| Internal Code | PT | EN | FR | ES |
|---------------|----|----|----|----|
| GR | GR | GK | G | POR |
| DD | DD | RB | AD | LD |
| DE | DE | LB | AG | LI |
| DC | DC | CB | DC | DFC |
| MDC | MDC | DM | MDC | MCD |
| MC | MC | CM | MC | MC |
| MOC | MOC | AM | MO | MCO |
| ED | ED | RW | AD | ED |
| EE | EE | LW | AG | EI |
| PL | PL | ST | ATT | DC |

| Internal Code | PT | EN | FR | ES |
|---------------|----|----|----|----|
| Dir | Dir | R | D | Der |
| Esq | Esq | L | G | Izq |
| Amb | Amb | Both | Amb | Amb |

**Important:** The database always stores the internal code (`GR`, `Dir`, `1ª Escolha`, etc.). Translation to the user's locale happens at display time only — in components, badges, filters, pitch labels, everywhere the user sees text. No internal code is ever shown raw to the user.

**Note:** Short codes for FR and ES need native speaker verification. PT and EN are confirmed.

#### 7.4. Implementation Approach

**`next-intl` setup:**

```typescript
// src/i18n/request.ts — server-side locale resolution
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // Read from user profile or cookie, fallback to 'pt'
  const locale = await resolveUserLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

```typescript
// In Server Components:
import { useTranslations } from 'next-intl';
const t = useTranslations('player');
// t('name') → "Nome" (pt) or "Name" (en)

// In Client Components:
import { useTranslations } from 'next-intl';
const t = useTranslations('common');
// t('save') → "Guardar" (pt) or "Save" (en)
```

**Migration of hardcoded strings:**
- Search all `.tsx` files for Portuguese text (labels, placeholders, toasts, error messages)
- Replace each with `t('key')` call
- Map constants (DEPARTMENT_OPINIONS, PIPELINE_STATUSES, etc.) through translation at display time
- Keep internal codes/values unchanged in DB and logic

**DB change:**
```sql
-- Migration 033+: add locale preference
ALTER TABLE profiles ADD COLUMN locale TEXT DEFAULT 'pt';
```

**Language selector:**
- Preferências page: dropdown to pick language (flag + name)
- Saves to `profiles.locale`
- Takes effect immediately (revalidate)

#### 7.5. What Gets Translated vs What Doesn't

| Translated (UI) | NOT translated (data) |
|------------------|-----------------------|
| All labels, buttons, headings | Player names |
| Placeholders, tooltips | Observation notes content |
| Toast messages, errors | Scouting report text (strengths, weaknesses, analysis) |
| Position display names | Club names |
| Opinion display names | Free-text fields (contact, recruitment notes) |
| Pipeline status display names | User-entered URLs |
| Nav items, page titles | |
| Date format (dd/MM/yyyy vs MM/dd/yyyy) | |
| Number format (1.234 vs 1,234) | |
| Empty states, onboarding text | |

#### 7.6. Sub-phases

- **7A:** Install `next-intl`, create `pt.json` (extract all existing hardcoded strings), configure middleware + layout
- **7B:** Create `en.json` (English translation)
- **7C:** Migrate all components — replace hardcoded text with `t()` calls
- **7D:** Translate domain constants (positions, opinions, statuses, foot) via lookup at display time
- **7E:** Add language selector to Preferências, `profiles.locale` column
- **7F:** Create `fr.json` and `es.json` (French + Spanish — need native verification)
- **7G:** Date/number formatting per locale

Each sub-phase deployable independently. App remains fully functional in Portuguese throughout — other languages become available incrementally.

**Deliverable:** Fully internationalized Eskout platform supporting PT, EN, FR, ES. Users choose their language. All UI text, domain terms, and formatting respect the chosen locale. Adding new languages requires only a JSON translation file.

---

### Phase 8 — Activity Log

Full audit trail of every meaningful action in the platform. Goes beyond the existing `status_history` (pipeline changes only) to cover all user actions. Visible to club admins.

#### 8.1. Data Model

```sql
CREATE TABLE activity_log (
  id BIGSERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_name TEXT NOT NULL,               -- Denormalized for fast display
  action TEXT NOT NULL,                  -- Verb: 'created', 'updated', 'deleted', 'moved', 'invited', etc.
  entity_type TEXT NOT NULL,             -- 'player', 'note', 'calendar_event', 'squad', 'pipeline', 'user', 'settings'
  entity_id TEXT,                        -- ID of affected entity (player id, note id, etc.)
  entity_name TEXT,                      -- Denormalized: "Rodrigo Almeida", "Sub-14 Treino", etc.
  metadata JSONB DEFAULT '{}',           -- Action-specific details (see below)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_activity_log_club_created ON activity_log (club_id, created_at DESC);
CREATE INDEX idx_activity_log_entity ON activity_log (club_id, entity_type, entity_id);
CREATE INDEX idx_activity_log_user ON activity_log (club_id, user_id);
```

**RLS:** Same club-scoped policy as other tables. Only club members can read their club's log.

#### 8.2. Tracked Actions

| Entity | Action | Metadata |
|--------|--------|----------|
| **Player** | `created` | `{ source: 'manual' \| 'import' \| 'scout_submission' }` |
| **Player** | `updated` | `{ fields: ['club', 'position'], old: { club: 'Porto' }, new: { club: 'Braga' } }` |
| **Player** | `deleted` | `{ name, club, position }` |
| **Player** | `position_changed` | `{ field: 'primary' \| 'secondary' \| 'tertiary', old: 'MC', new: 'MOC' }` |
| **Player** | `scraped` | `{ source: 'fpf' \| 'zerozero', changes: ['club', 'photo'] }` |
| **Player** | `referred` | `{ referred_by: 'Rui Andrade', referred_by_user_id: '...' }` |
| **Video** | `created` | `{ url, title }` |
| **Video** | `deleted` | `{ url, title }` |
| **Pipeline** | `status_changed` | `{ old: 'a_observar', new: 'em_contacto', notes: '...' }` |
| **Squad** | `added_to_shadow` | `{ position: 'DC', squad: 'shadow' }` |
| **Squad** | `removed_from_shadow` | `{ position: 'DC' }` |
| **Squad** | `added_to_real` | `{ position: 'DC_E' }` |
| **Squad** | `removed_from_real` | `{ position: 'DC_E' }` |
| **Note** | `created` | `{ priority: 'urgente', preview: '...' }` |
| **Note** | `deleted` | `{ preview: '...' }` |
| **Calendar** | `created` | `{ event_type: 'treino', date: '2026-03-15' }` |
| **Calendar** | `updated` | `{ fields: ['date', 'location'] }` |
| **Calendar** | `deleted` | `{ title, date }` |
| **Evaluation** | `rated` | `{ rating: 4 }` |
| **Evaluation** | `updated` | `{ old_rating: 3, new_rating: 4 }` |
| **User** | `invited` | `{ email, role }` |
| **User** | `role_changed` | `{ old: 'scout', new: 'editor' }` |
| **User** | `removed` | `{ email, role }` |
| **Settings** | `updated` | `{ fields: ['escaloes', 'features'] }` |

#### 8.3. Logging Strategy

**Server Action wrapper:** A helper function `logActivity()` called at the end of every Server Action after the mutation succeeds. Not middleware — explicit calls so we control exactly what gets logged and with what metadata.

```typescript
// src/lib/activity.ts
export async function logActivity(params: {
  clubId: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  metadata?: Record<string, unknown>;
}) { /* insert into activity_log */ }
```

**Diff helper for updates:** When updating a player, compute which fields actually changed and log only those. Don't log unchanged fields.

**No logging for:** read operations, login/logout (Supabase handles auth logs), bulk imports (log one summary entry, not one per player).

#### 8.4. UI

**Page:** `/atividade` — accessible to club admins only.

**Layout:**
- Timeline feed, newest first, infinite scroll
- Each entry: avatar + "**Diogo Nunes** adicionou **Rodrigo Almeida** ao plantel sombra como DC" + timestamp
- Filter by: entity type, user, date range
- Click on entity name → navigate to player profile / calendar event / etc.
- Compact on mobile, wider cards on desktop

**Dashboard widget:** "Atividade Recente" card showing last 5 actions. Already exists as `RecentChanges` — extend it to use activity_log instead of status_history.

**Player profile — "Histórico do Jogador" timeline (admin only):**

Vertical timeline in the player profile, newest first. Gives full chronological context — the player is not a static snapshot but a living process.

Events shown:
- Jogador adicionado à base de dados
- Jogador referenciado (por quem)
- Relatório adicionado (por quem)
- Avaliação do departamento alterada (de X para Y)
- Avaliação do observador alterada
- Decisão alterada
- Posição principal / secundária / terciária alterada
- Estado do pipeline alterado (de X para Y)
- Adicionado / removido do plantel sombra / real
- Nota de observação adicionada
- Vídeo adicionado
- Dados atualizados via scraping (FPF/ZZ)
- Treino realizado (com feedback, Phase 13)

Each timeline entry:
- Date (e.g. "05 Mar 2026")
- Event type icon (color-coded dot or small icon)
- Short description (e.g. "Relatório adicionado por **Rui Andrade**")
- User responsible (when applicable)

Visual: vertical line connecting dots, alternating left/right on desktop, single column on mobile. Compact — no cards, just text rows with dots and dates.

**Visibility:** Admin only (first phase). Can be extended to editors later if needed.

**First phase can be simple:** just the most important events (created, status changes, reports, evaluations). More event types added incrementally as activity_log grows.

#### 8.5. Retention

- Keep last 90 days by default (per club)
- Configurable in `clubs.settings.activity_retention_days`
- Cron job or Supabase Edge Function to prune old entries monthly
- Future: export activity log as CSV for compliance

#### 8.6. Migration from status_history

The existing `status_history` table covers pipeline status changes. After activity_log is live:
- Backfill existing status_history entries into activity_log
- Keep `status_history` table for backwards compat during transition
- Eventually deprecate `status_history` — activity_log replaces it entirely

#### 8.7. Sub-phases

- **8A:** Create `activity_log` table + RLS + `logActivity()` helper
- **8B:** Add logging calls to all existing Server Actions (players, pipeline, squads, notes, calendar, evaluations)
- **8C:** Build `/atividade` page (timeline feed, filters)
- **8D:** Extend dashboard "Atividade Recente" + player profile "Histórico"
- **8E:** Retention policy + cleanup job

**Deliverable:** Complete audit trail of all platform activity. Club admins see who did what, when, on a timeline. Replaces the limited `status_history` with a full activity log.

---

### Phase 9 — Onboarding Wizard

Guided setup for new clubs. When a club admin enters their club for the first time, a step-by-step wizard helps them configure everything before the team starts using the platform.

#### 9.1. Trigger

The wizard shows when:
- User has `admin` role in the club
- `clubs.settings.onboarding_complete` is `false` (default)
- Navigating to any page redirects to `/configurar` until wizard is completed or skipped

Admin can skip the wizard at any step → sets `onboarding_complete = true`, can always return via Definições.

#### 9.2. Wizard Steps

**Step 1 — Bem-vindo / Welcome**
- Club name + logo confirmation (pre-filled by superadmin)
- Upload or change club logo
- Choose default language (if i18n is live)

**Step 2 — Escalões**
- Define which age groups the club uses
- Pre-filled with common PT structure (Sub-7 to Sub-19) — admin toggles which ones to activate
- Custom escalão name + generation year for each
- Can add/remove later in settings

**Step 3 — Equipa / Team**
- Invite users by email: name, email, role (admin/editor/scout)
- Minimum: at least 1 other user recommended (not required)
- Can skip and invite later
- Shows pending invites

**Step 4 — Importar Jogadores (optional)**
- Option A: Start empty — add players manually later
- Option B: Import from Excel/CSV — upload file, map columns
- Option C: Paste FPF/ZeroZero links (PT clubs) — batch scrape
- This step is skippable

**Step 5 — Funcionalidades / Features**
- Show all toggleable features (from Phase 6) with description
- Admin enables/disables what the club needs
- Sensible defaults: all on
- Can change later in settings

**Step 6 — Pronto!**
- Summary of what was configured
- CTA: "Ir para o Painel" → dashboard
- Sets `onboarding_complete = true`

#### 9.3. UI Design

- Full-screen wizard, no sidebar/nav (clean focus)
- Progress indicator: step dots or numbered bar at top
- Each step: heading + description + form/action area
- Mobile-first: single column, large touch targets
- Back/Next buttons at bottom, Skip link subtle
- Animations between steps (slide or fade)

#### 9.4. Technical Notes

- Route: `/configurar` — protected by middleware (admin only, club context required)
- Each step auto-saves on Next (no final submit) — if admin leaves mid-wizard, resumes where they left off
- Step progress stored in `clubs.settings.onboarding_step` (number)
- Reuses existing Server Actions (age groups, invitations, features)
- No new tables needed — just `clubs.settings` fields

#### 9.5. Sub-phases

- **9A:** Wizard shell (route, layout, step navigation, progress bar)
- **9B:** Steps 1-2 (club identity + escalões)
- **9C:** Step 3 (invite team members)
- **9D:** Step 4 (import players — reuse existing import logic)
- **9E:** Steps 5-6 (features + finish)

**Deliverable:** New clubs are guided through setup in under 5 minutes. Reduces admin confusion and ensures clubs are properly configured before scouts start using the platform.

---

### Phase 10 — Demo Mode

A read-only demo club with realistic fictional data. Prospects can explore the full platform without creating an account. Shows the value of Eskout before committing.

#### 10.1. How It Works

- Superadmin creates a special club with `clubs.is_demo = true`
- Demo club is pre-populated with realistic data: ~50 fictional players across 3-4 escalões, shadow/real squads, pipeline entries, observation notes, calendar events, scouting reports
- Public access: no login required, accessed via `/demo` route
- All actions are **read-only** — no editing, no adding, no deleting
- UI shows a persistent banner: "Modo Demonstração — Crie uma conta para começar"
- CTA button always visible → links to signup / contact

#### 10.2. Data

**Fictional but realistic:**
- Portuguese player names (generated, not real people)
- Real club names are fine (Boavista, Porto, Benfica, etc.)
- Varied pipeline states, opinions, evaluations
- A few scouting reports with realistic text
- Calendar with upcoming events
- Shadow squad partially filled, real squad complete
- 3 escalões: Sub-14, Sub-16, Sub-18

**Seeded via script:** A seed script (`scripts/seed_demo.ts`) generates demo data and inserts into the demo club. Can be re-run to refresh.

#### 10.3. Technical Implementation

**Route:** `/demo` — special layout without login requirement.

**Auth bypass:** Demo mode uses a special anonymous session or a pre-created read-only user. Supabase anonymous auth or a shared demo token.

**Read-only enforcement:**
- RLS policy: demo club allows SELECT only, no INSERT/UPDATE/DELETE
- Application layer: `useClub()` returns `{ isDemo: true }` → all edit buttons hidden, forms disabled
- Middleware: POST/PUT/DELETE requests to Server Actions blocked for demo club

**Isolated:** Demo club data is completely separate. If someone somehow bypasses read-only, they only affect the demo club (which can be re-seeded).

#### 10.4. UI Differences in Demo Mode

- **Banner** at top: "Modo Demonstração" + CTA button
- **No edit buttons**, no add player, no delete — view-only versions of all pages
- **Navigation** works fully — all pages accessible
- **Feature toggles** all enabled — show everything
- **Age group selector** works (switch between demo escalões)
- **Watermark or subtle overlay** on exported images (if someone tries to export)

#### 10.5. Sub-phases

- **10A:** `is_demo` flag on clubs, demo RLS policies, read-only middleware
- **10B:** `/demo` route + anonymous auth + demo layout with banner
- **10C:** Seed script for demo data (`scripts/seed_demo.ts`)
- **10D:** UI read-only mode (hide edit actions, disable forms)

**Deliverable:** A live, explorable demo that sells Eskout to new clubs. Zero friction — no signup needed. Showcases every feature with realistic data.

---

### Phase 11 — Landing Page & Subscriptions

The public face of Eskout: marketing site + subscription system. **This is the last phase** — only built after multi-tenant, i18n, and demo mode are live.

#### 11.1. Landing Page (`eskout.co`)

**Separate from the app.** The landing page is a static/SSG site at the root domain. The app lives at `app.eskout.co`. Could be the same Next.js project (route group) or a separate deployment — TBD based on complexity.

**Sections:**

| Section | Content |
|---------|---------|
| **Hero** | Headline + subheadline + CTA ("Experimentar Demo" / "Começar Agora") + hero screenshot/mockup |
| **Problema** | What scouting departments struggle with (spreadsheets, no structure, lost data) |
| **Solução** | What Eskout solves — 3-4 feature highlights with icons/screenshots |
| **Funcionalidades** | Grid of all features with short descriptions: Plantel Real vs Sombra, Pipeline, Relatórios, Calendário, etc. |
| **Screenshots** | Carousel or grid of real app screenshots (mobile + desktop) |
| **Demo** | Embedded CTA → `/demo` — "Explore sem criar conta" |
| **Preços** | Subscription plans (see 11.2) |
| **Testemunhos** | Quotes from beta clubs (when available) |
| **FAQ** | Common questions |
| **Footer** | Contact, legal, social links |

**i18n:** Landing page available in PT, EN, FR, ES (same locale files from Phase 7).

**Design:** Clean, modern, black & white Eskout brand. Mobile-first. Fast (static/SSG, no heavy JS).

#### 11.2. Subscription Model

**Plans (initial structure — pricing TBD):**

| Plan | Target | Limits | Features |
|------|--------|--------|----------|
| **Starter** | Small clubs, academies | 3 users, 2 escalões, 200 players | Core features (players, squad, pipeline) |
| **Pro** | Mid-size clubs | 10 users, all escalões, 1000 players | All features (calendar, reports, export, alerts) |
| **Enterprise** | Professional clubs | Unlimited users, unlimited players | All features + priority support + custom branding |

**Free trial:** 14 days of Pro, no credit card required. After trial → downgrade to Starter or subscribe.

**Feature gating:** Uses the same `clubs.features` JSONB from Phase 6. When a club is on Starter, certain features are disabled. Upgrading flips the toggles.

**Limits enforcement:**
- `clubs.limits` JSONB: `{ max_users, max_age_groups, max_players }`
- Server Actions check limits before insert: "Limite de jogadores atingido. Faça upgrade para adicionar mais."
- UI shows usage: "147 / 200 jogadores"

#### 11.3. Payment Integration

**Provider:** Stripe — industry standard for SaaS subscriptions.

| Component | Description |
|-----------|-------------|
| **Stripe Checkout** | Redirect to Stripe-hosted payment page (no PCI compliance needed) |
| **Stripe Customer Portal** | Manage subscription, update card, view invoices — Stripe-hosted |
| **Webhooks** | `POST /api/webhooks/stripe` — handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |
| **Sync** | Webhook updates `clubs.subscription_status`, `clubs.plan`, `clubs.limits`, `clubs.features` |

**DB additions:**
```sql
ALTER TABLE clubs ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE clubs ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE clubs ADD COLUMN plan TEXT DEFAULT 'trial';        -- 'trial', 'starter', 'pro', 'enterprise'
ALTER TABLE clubs ADD COLUMN subscription_status TEXT DEFAULT 'trialing'; -- 'trialing', 'active', 'past_due', 'canceled'
ALTER TABLE clubs ADD COLUMN trial_ends_at TIMESTAMPTZ;
```

**Flow:**
1. Club admin clicks "Upgrade" or "Subscrever" (in-app or landing page)
2. Redirect to Stripe Checkout with plan + club metadata
3. Stripe processes payment → webhook fires
4. Webhook updates club plan/limits/features
5. User returns to app → sees upgraded features immediately

#### 11.4. Subscription Management UI

**In-app (`/definicoes/plano`):**
- Current plan name + status
- Usage meters (users, players, escalões)
- "Upgrade" button → Stripe Checkout
- "Gerir subscrição" → Stripe Customer Portal (invoices, cancel, update card)
- Trial countdown: "Faltam X dias do período experimental"

**Superadmin (`/master/clubes/[id]`):**
- View club's plan, status, Stripe links
- Override plan manually (for partnerships, special deals)
- Extend trial

#### 11.5. Sub-phases

- **11A:** Landing page design + build (static sections, responsive, i18n)
- **11B:** Define final plans + pricing + feature mapping per plan
- **11C:** Stripe integration (checkout, webhooks, customer portal)
- **11D:** In-app subscription management UI + limit enforcement
- **11E:** Superadmin subscription management
- **11F:** Free trial flow (auto-create trial on club creation, countdown, expiry handling)

**Deliverable:** Public-facing marketing site that converts visitors into paying customers. Stripe-powered subscriptions with plan-based feature gating. Self-service billing management for club admins.

---

### Phase 12 — Player Comparison

Side-by-side comparison of 2 or 3 players. The key decision-making tool when choosing between candidates for the same position.

#### 12.1. How It Works

**Entry points:**
- Player table: checkbox to select players → "Comparar (2)" button appears in a floating bar
- Player profile: "Comparar" action → opens picker to add opponents
- Position view: select 2-3 players from the same position group
- Pipeline: compare candidates in the same stage

**Limit:** 2 or 3 players max. Must be selected — no default.

**Route:** `/comparar?ids=123,456,789` — shareable URL.

#### 12.2. Comparison Layout

**Mobile (primary):** Swipeable cards — swipe left/right to switch between players. Sticky header with player names/photos as tabs. All data sections stacked vertically, values side by side per row.

**Desktop:** Columns side by side (2 or 3 columns). Fixed header with photo + name + club. Scrollable body with all comparison rows.

#### 12.3. Comparison Sections

| Section | Rows |
|---------|------|
| **Dados Básicos** | Foto, nome, idade, clube, escalão, nacionalidade |
| **Posição** | Posição principal, secundária, terciária (visual dots like MiniPitch) |
| **Físico** | Altura, peso, pé |
| **Avaliação** | Rating médio (relatórios), avaliação do observador, decisão |
| **Opinião** | Opinião do departamento (badge), avaliação dos scouts (stars) |
| **Pipeline** | Estado do recrutamento (badge), datas (treino, reunião, assinatura) |
| **Relatórios** | Número de relatórios, rating médio, pontos fortes, pontos fracos |
| **Estatísticas** | Jogos na época, golos (ZeroZero) |
| **Notas** | Última nota de observação (preview) |

**Visual highlights:**
- Best value per row gets a subtle green accent (e.g. highest rating, more games)
- Missing data shown as "—" in muted text
- Position overlap highlighted: if both play DC, show match icon

#### 12.4. Technical Notes

- Pure client component — all data already available from player objects
- No new DB tables or queries — reuses existing player data
- Comparison state: URL params (`ids=`) + optional localStorage for recent comparisons
- "Recentes" section: last 5 comparisons saved locally for quick re-access
- Export: "Guardar comparação como imagem" — reuses `html2canvas-pro` pattern from player profile

#### 12.5. Sub-phases

- **12A:** Route + layout shell (columns/swipe), player selection floating bar
- **12B:** All comparison sections with data rendering
- **12C:** Visual highlights (best values, missing data)
- **12D:** Entry points (table checkboxes, profile action, position view)
- **12E:** Export as image + recent comparisons

**Deliverable:** Decision-making tool that lets scouts and admins compare 2-3 candidates side by side across every dimension. Reduces gut-feel decisions with structured, visual comparison.

---

### Phase 13 — Training Feedback

Structured feedback forms for when a player comes to train at the club (`vir_treinar` pipeline stage). Replaces loose notes with a consistent, queryable evaluation.

#### 13.1. Data Model

```sql
CREATE TABLE training_feedback (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,                     -- When the training happened
  coach_user_id UUID REFERENCES profiles(id),     -- Who submitted the feedback
  coach_name TEXT NOT NULL,                        -- Denormalized

  -- Structured ratings (1-5 scale)
  technical INT CHECK (technical BETWEEN 1 AND 5),        -- Nível técnico
  tactical INT CHECK (tactical BETWEEN 1 AND 5),          -- Compreensão tática
  physical INT CHECK (physical BETWEEN 1 AND 5),          -- Capacidade física
  attitude INT CHECK (attitude BETWEEN 1 AND 5),          -- Atitude / mentalidade
  adaptation INT CHECK (adaptation BETWEEN 1 AND 5),      -- Adaptação ao grupo

  -- Overall
  overall_rating INT CHECK (overall_rating BETWEEN 1 AND 5),  -- Avaliação geral
  decision TEXT CHECK (decision IN ('assinar', 'repetir', 'descartar')),  -- Decisão
  notes TEXT DEFAULT '',                           -- Observações livres

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_training_feedback_player ON training_feedback (club_id, player_id);
CREATE INDEX idx_training_feedback_date ON training_feedback (club_id, session_date DESC);
```

#### 13.2. Decision Values

| Value | Label PT | Description |
|-------|----------|-------------|
| `assinar` | Assinar | Ready to sign, proceed |
| `repetir` | Repetir Treino | Needs another session to decide |
| `descartar` | Descartar | Not a fit, don't pursue |

#### 13.3. UI — Feedback Form

**Trigger:** When a player's pipeline status is `vir_treinar` or has a `training_date`, a "Registar Treino" button appears on their profile.

**Form layout:**
- **Date picker** — session date (defaults to today)
- **5 rating dimensions** — each is a row with label + 5 tappable stars or number selector
  - Técnica, Tática, Físico, Atitude, Adaptação
- **Overall rating** — larger, prominent star rating
- **Decision** — 3-button toggle: Assinar / Repetir / Descartar (color-coded: green / yellow / red)
- **Notes** — free-text area for additional observations
- **Submit** button

**Mobile-first:** Single column, large touch targets for stars, decision buttons full-width.

#### 13.4. UI — Display

**Player profile:** New "Treinos" section (between Pipeline/Recruitment and Notas). Shows:
- List of training feedback entries, newest first
- Each entry: date, coach name, 5 dimension ratings as mini bar/dots, overall rating, decision badge, notes preview
- Tap to expand full details

**Pipeline view:** Players in `vir_treinar` column show training feedback summary — overall rating + decision badge if feedback exists, or "Sem feedback" chip if not.

**Dashboard widget (future):** "Treinos esta semana" — list of players who trained, with overall rating and decision.

#### 13.5. Interaction with Pipeline

When training feedback is submitted with a decision:
- **Assinar** → suggest moving player to `a_decidir` or `confirmado` (prompt, not automatic)
- **Repetir** → keep in `vir_treinar`, optionally create calendar event for next training
- **Descartar** → suggest moving to `rejeitado` (prompt)

These are suggestions, not forced transitions. Admin confirms the pipeline move.

#### 13.6. Sub-phases

- **13A:** `training_feedback` table + RLS + Server Action for submit
- **13B:** Feedback form (ratings, decision, notes)
- **13C:** Player profile "Treinos" section
- **13D:** Pipeline view integration (feedback summary on `vir_treinar` cards)
- **13E:** Pipeline transition suggestions after feedback

**Deliverable:** Structured, consistent training evaluations that replace ad-hoc notes. Every training session produces queryable data: 5 dimensions + overall + decision. Feeds directly into pipeline decisions.

---

### Phase 14 — Analytics Dashboard

Advanced metrics and insights for club admins. Replaces the basic dashboard counters with actionable analytics about scouting productivity, pipeline health, and squad coverage.

#### 14.1. Route

`/analytics` — accessible to club admins and editors. Link in sidebar under "Mais" or as a top-level nav item.

#### 14.2. Metric Cards (Top Row)

Quick-glance KPIs with comparison to previous period (month or season):

| Metric | Description | Visual |
|--------|-------------|--------|
| **Jogadores Observados** | Total players with at least 1 observation note or scouting report | Number + trend arrow |
| **Jogadores Adicionados** | New players created this period | Number + trend arrow |
| **Assinaturas** | Players who reached `assinou` status | Number + trend arrow |
| **Tempo Médio no Pipeline** | Average days from `por_tratar` to `confirmado`/`assinou` | Days + trend |

#### 14.3. Scout Productivity

**Table/chart:** One row per scout (user with scout/editor role).

| Column | Description |
|--------|-------------|
| Nome | Scout name + avatar |
| Jogadores Referenciados | Players where `referred_by_user_id` = this scout |
| Notas Escritas | Observation notes authored this period |
| Relatórios | Scouting reports submitted |
| Avaliações | Scout evaluations submitted |
| Pipeline Avançados | Players they referred that advanced past `a_observar` |

**Sortable by any column.** Shows who's active and who's contributing most.

#### 14.4. Pipeline Funnel

**Visual funnel chart:** Shows how many players are in each pipeline stage, with conversion rates between stages.

```
Por Tratar (120) ──▶ A Observar (85) ──▶ Em Contacto (30) ──▶ Vir Treinar (12) ──▶ Confirmado (5)
                71%                   35%                  40%                  42%
```

- Color-coded bars per stage
- Percentage shows conversion from previous stage
- Click a stage → filtered player list
- Period selector: this season, last 30 days, custom range

#### 14.5. Position Coverage

**Grid/matrix:** Rows = positions (GR, DD, DE, DC, ...), columns = status.

| Posição | Plantel Real | Plantel Sombra | Em Pipeline | Total Observados |
|---------|-------------|----------------|-------------|-----------------|
| GR | 2 | 1 | 3 | 8 |
| DC | 4 | 2 | 5 | 22 |
| PL | 1 | 0 | 2 | 15 |

**Highlights:**
- Red if shadow squad slot is empty (gap)
- Amber if pipeline is thin (<3 candidates) for a position with shadow gap
- Green if position is well covered

Shows at a glance: "We have no shadow PL and only 2 in pipeline — this position needs focus."

#### 14.6. Activity Over Time

**Line chart:** Actions per week/month over the last 6 months. Lines for:
- Players added
- Notes written
- Pipeline moves
- Reports submitted

Shows scouting department activity trends. Useful for admin to see if work is being done consistently or in bursts.

#### 14.7. Escalão Breakdown

**Bar chart or table:** Per age group:
- Total players scouted
- Players in pipeline
- Shadow squad completeness (filled / total slots)
- Signings

Shows which escalões are getting attention and which are neglected.

#### 14.8. Technical Notes

- **Charts library:** `recharts` (lightweight, React-native, works with SSR) or `chart.js` via `react-chartjs-2`
- **Data source:** Aggregation queries on existing tables — no new tables needed (except activity_log from Phase 8 for activity trends)
- **Caching:** Dashboard queries can be expensive — cache with `revalidateTag` on a 5-minute cycle, or compute on demand with loading skeletons
- **Period selector:** Default "Esta Época" (season), options: last 30 days, last 90 days, custom range
- **Export:** "Exportar Relatório" button → PDF summary of all metrics for the selected period

#### 14.9. Sub-phases

- **14A:** Route + layout shell + period selector
- **14B:** Top-row KPI metric cards
- **14C:** Scout productivity table
- **14D:** Pipeline funnel visualization
- **14E:** Position coverage matrix
- **14F:** Activity over time chart + escalão breakdown
- **14G:** Export analytics as PDF

**Deliverable:** Data-driven insights for scouting department management. Admins see scout productivity, pipeline health, position gaps, and activity trends — all in one page. Replaces guesswork with metrics.

---

### Phase 15 — Personal Player Lists

User-created lists to organize jogadores por contexto. Cada utilizador cria as suas listas com nome livre — "Reunião sexta", "Targets DC verão", "Observar fim-de-semana". Substituem favoritos, listas externas, e notas mentais.

#### 15.1. Data Model

```sql
CREATE TABLE player_lists (
  id SERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Reunião terça", "Targets DC"
  description TEXT DEFAULT '',           -- Optional description
  color TEXT DEFAULT '#a3a3a3',          -- Label color for visual distinction
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, user_id, name)       -- No duplicate names per user per club
);

CREATE TABLE player_list_items (
  id SERIAL PRIMARY KEY,
  list_id INT NOT NULL REFERENCES player_lists(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT DEFAULT '',                 -- Optional note on why this player is in this list
  sort_order INT DEFAULT 0,             -- Manual ordering within the list
  UNIQUE (list_id, player_id)           -- No duplicates within a list
);

CREATE INDEX idx_player_lists_user ON player_lists (club_id, user_id);
CREATE INDEX idx_player_list_items_list ON player_list_items (list_id);
CREATE INDEX idx_player_list_items_player ON player_list_items (player_id);
```

**RLS:** Lists are personal — user can only see/edit their own lists. Admins cannot see other users' lists (personal workspace).

#### 15.2. Core Features

**Create list:** Name + optional color + optional description. Quick-create from anywhere (modal or inline).

**Add player to list:** Bookmark icon (`Bookmark` from lucide) on player card, table row, and profile. Bookmark communicates "guardar/organizar" better than star (which implies "favorito"). Tapping opens a mini-popover: checkboxes for each list + "Nova lista" shortcut. If user has 0 lists, tapping bookmark prompts to create first list.

**A player can be in zero, one, or multiple lists from the same user.** This is by design — a player can belong to "Targets DC" and "Reunião sexta" simultaneously.

**Remove from list:** Uncheck in the popover, or swipe-to-remove within the list view.

**Delete list:** Confirmation dialog. Removes list + all items. Players are not affected.

**Bookmark indicator:** Players that appear in at least 1 list show a filled bookmark icon in table/card views. Subtle — doesn't clutter.

#### 15.3. List View

**Route:** `/listas` — personal page, shows all user's lists.

**Layout:**
- Grid of list cards (name, color dot, player count, last updated)
- Tap card → opens list detail

**List detail:**
- Header: list name (editable), description, color, player count
- Player grid/table: same as main player table but filtered to list members
- **Filters within list:** position, escalão, clube, pé — to avoid creating filter-lists like "2011" or "2012"
- **Sort:** manual drag-and-drop (for prioritized lists) or by name/position/club
- Bulk actions: remove selected, move to another list
- Share: future — share list with other club members (read-only)

**Empty states (important for UX):**
- **No lists yet:** "Ainda não tens listas criadas. Cria a tua primeira lista para organizar jogadores." + CTA "Criar lista"
- **Empty list:** "Esta lista ainda não tem jogadores. Adiciona jogadores a partir da tabela, perfil ou pipeline." + link to players page
- **Scout with no eligible players:** "Só podes adicionar jogadores sobre os quais já submeteste relatório." — shown when scout has 0 submitted reports

**Audit:** `player_lists.updated_at` auto-updates on any change (add/remove player, rename, reorder). `player_list_items.added_at` tracks when each player was added. No `updated_by` needed — lists are personal, only the owner modifies them. "Last updated" shown on list cards in `/listas`.

#### 15.4. Role-specific Behaviour

| Role | Can create lists | Players available |
|------|-----------------|-------------------|
| **Admin** | Yes | All players in the club |
| **Editor** | Yes | All players in the club |
| **Scout** | Yes | Only players visible within their existing permission scope (in practice, players they submitted reports for) |

**Important:** Lists never change permissions. A list is purely organizational — it doesn't grant access to data the user can't already see. The visibility rules are the same as everywhere else in the app; lists just group players the user already has access to.

#### 15.5. UI Integration Points

| Location | Behaviour |
|----------|-----------|
| **Player table** | Bookmark icon per row. Filled if player is in any list. Click → list popover. |
| **Player card (mobile)** | Bookmark icon in card header. Same popover. |
| **Player profile** (admin/editor only) | Bookmark icon in action bar. Same popover. Shows which lists the player belongs to. |
| **Scout surfaces** | Bookmark icon only on surfaces the scout already has access to (submissions list, limited player views). NOT on full player profile — scouts don't access that page. |
| **Sidebar / nav** | "Listas" nav item with list count badge. |
| **Player comparison (Phase 12)** | "Adicionar à lista" action on comparison view. |
| **Pipeline cards** | Bookmark icon on pipeline cards. |

#### 15.6. Quick Actions

- **Add from search:** Search players → bookmark → add to list. Fast workflow.
- **Bulk add:** Select multiple players in table → "Adicionar a lista" → pick list.
- **Duplicate list:** Copy an existing list (useful for "Reunião semana passada" → "Reunião esta semana").
- **Player count in nav:** Badge next to "Listas" showing total lists (like alerts badge).

#### 15.7. Design Guidelines

**1. Lists ≠ Pipeline.** Lists are personal organization; pipeline/opinion/shadow squad are shared player state. UI and copy must never blur the two. Bookmark icon + "As minhas listas" label reinforce it's personal. Never suggest that adding to a list replaces moving in pipeline or changing opinion.

**2. Scout experience must be polished.** Limited visibility must not mean confusing UX. Map clearly: where the scout sees the bookmark (submissions, visible player list), what shows inside the list (same limited info they already see), how they navigate from list → player (no access to full profile). Test the scout flow end-to-end before shipping.

**3. Visual discretion.** The bookmark and popovers touch many surfaces (card, table, profile, pipeline, nav). Keep the icon small and subtle — it must not compete with opinion, position, or rating which are more important. Lightweight popover (not modal). No excessive animations. The feature should be discoverable but not intrusive.

#### 15.8. Sub-phases

- **15A:** `player_lists` + `player_list_items` tables + RLS + Server Actions (CRUD)
- **15B:** Star icon integration (table, card, profile) + list popover
- **15C:** `/listas` page (list grid + list detail with filters)
- **15D:** Manual sort (drag-and-drop within list)
- **15E:** Bulk actions (multi-select add/remove, duplicate list)

**Deliverable:** Personal workspace for organizing players. Each user creates themed lists, adds players from anywhere with one tap, and browses them with filters and manual sorting. Replaces external notes, bookmarks, and mental lists with an in-app tool that respects role permissions.

---

## 10. Data Files & Scripts

| File | Description |
|------|-------------|
| `data/all_players.json` | 1,982 players from all age groups, extracted from Excel (with FPF links and report Google Drive links) |
| `docs/SOP.md` | This document |
| `docs/report_template.pdf` | Example scouting report PDF for reference when building the parser |
| `scripts/import_initial_data.ts` | TypeScript script to import `all_players.json` into Supabase |
| `scripts/extract_reports.py` | Download PDFs from Google Drive + parse scouting report template into structured data |
| `scripts/full_reset.py` | **Full database reset script** — the single command to rebuild the entire database from scratch |

### Full Reset Script (`scripts/full_reset.py`)

**This is the final step of the project setup.** After all code is deployed, run this script to start with a clean, fully enriched database.

```bash
python3 scripts/full_reset.py
```

**What it does (in order):**
1. **Clears data tables** — deletes all player-related data (asks confirmation: type "RESET")
2. **Imports players** — runs `import_initial_data.ts` to load 1,982 players from `all_players.json`
3. **Scrapes FPF** — fetches current club for each player from FPF website
4. **Scrapes ZeroZero** — fetches stats, history, and photos from ZeroZero
5. **Extracts PDF reports** — downloads and parses scouting report PDFs from Google Drive

**What it DELETES:**
| Table | Description |
|-------|-------------|
| `scouting_reports` | Extracted PDF report data |
| `status_history` | Pipeline/status change log |
| `observation_notes` | Scout field notes |
| `calendar_events` | Calendar events |
| `players` | All players (includes pipeline, squad assignments, etc.) |

**What it does NOT delete:**
| Table | Description |
|-------|-------------|
| `profiles` | User accounts (admin/scout) |
| `age_groups` | Age group definitions (Sub-7 to Sub-19) |

**Flags:**
| Flag | Description |
|------|-------------|
| `--no-clear` | Skip database clear (add to existing data) |
| `--skip-import` | Skip player import |
| `--skip-scrape` | Skip FPF + ZeroZero scraping |
| `--skip-fpf` | Skip FPF only |
| `--skip-zerozero` | Skip ZeroZero only |
| `--skip-reports` | Skip PDF report extraction |
| `--scrape-only` | Only run scraping (no clear, no import, no reports) |
| `--reports-only` | Only run PDF extraction (no clear, no import, no scraping) |

**Requirements:**
```bash
pip3 install pdfplumber supabase python-dotenv google-auth google-api-python-client
```

**Environment (.env.local):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_KEY` — path to Google Service Account JSON key file

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
