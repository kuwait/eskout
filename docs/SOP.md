# SOP — Boavista FC Youth Squad Planning Tool

**Version:** 5.4 | **Date:** March 6, 2026 | **UI Language:** Portuguese (PT-PT)

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
| Export | PDF, image, text, WhatsApp-formatted, and print for squads. Excel export for filtered DB (planned). |
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

---

## 4. Features

### 4.1. Authentication & User Management
- Login page: email + password (Supabase Auth)
- Four roles: `admin`, `master`, `scout`, `scout_externo`
- Admin: create/edit/delete users, assign roles
- Session persistence across browser sessions
- Protected routes → redirect to login if unauthenticated
- Role-based route protection:
  - **Admin only:** `/admin/utilizadores`, `/importar`, `/exportar`
  - **Admin + Master + Scout:** All main pages (dashboard, campo, jogadores, pipeline, posições, calendário)
  - **Scout Externo:** Only `/submeter` (dedicated submission page) — redirected away from all other routes

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
- Available to: Admin, Master, Scout
- **Scout Externo** uses a separate dedicated submission page (`/submeter`) — see Section 4.16

### 4.16. External Scout Submission Page (`/submeter`)
Dedicated, simplified page for Scout Externo users.

- Only page accessible to Scout Externo role (all other routes redirect here)
- Simplified form: Name, Date of Birth, Position, Club, Foot, Notes
- Auto-set: `created_by` = current user, `status` = `pool`, `opinion` = `Por Observar`
- No access to existing player data, squads, pipeline, or any other feature
- Mobile-optimized: designed for quick field submissions
- Success feedback: toast confirmation, form reset for next submission

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
│   │   ├── submeter/page.tsx          # External scout submission page — PLANNED
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
│   │   │   ├── MobileNav.tsx          # Bottom tab navigation (6 tabs, with alert badges)
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
  shadow_position TEXT                   -- Position in shadow squad (may differ from original)
    CHECK (shadow_position IN ('GR','DD','DE','DC','MDC','MC','MOC','ED','EE','PL') OR shadow_position IS NULL),
  squad_order INT DEFAULT 0,             -- Manual ordering within position groups in squads
  dc_sub_slot TEXT                       -- Sub-slot for DC position (e.g., 'left', 'right')
    CHECK (dc_sub_slot IN ('left', 'right') OR dc_sub_slot IS NULL),

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

**FPF parsing:** Extracts `var model = {...}` embedded JSON — fields: FullName, CurrentClub, Image, BirthDate, Nationality, BirthCountry.

**ZeroZero parsing:**
- **Encoding:** ISO-8859-1 (decoded manually via `TextDecoder`)
- **JSON-LD:** Person schema — image, name, birthDate, nationality, height, weight, worksFor
  - `worksFor` can be string, object, array, or a string containing a JSON array (e.g. `"[{@type:SportsTeam,name:Padroense}]"`) — all formats handled with JSON.parse + regex fallback
- **Sidebar card-data** (most reliable): Position, Foot, DOB, Nome, Clube atual, Nacionalidade, País de Nascimento, Altura, Peso
  - DOB formats: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd`, `yyyy-MM-dd (XX anos)`
- **Header:** Shirt number from `<span class="number">7.</span>`, name from `<h1 class="zz-enthdr-name">`
- **Career table:** Season, club, games, goals per row

**Server actions:**
- `scrapePlayerFpf(playerId)` — scrape FPF for existing player
- `scrapePlayerZeroZero(playerId)` — scrape ZeroZero for existing player
- `scrapePlayerAll(playerId)` — scrape both, merge, return changes
- `scrapeFromLinks(fpfLink?, zzLink?)` — scrape from raw URLs (no player needed, for Add Player flow)
- `applyScrapedData(playerId, updates)` — apply selected scraped fields to player
- `autoScrapePlayer(playerId, fpfChanged, zzChanged)` — triggered after profile save if links changed
- `bulkScrapeExternalData(offset, limit, sources)` — batch scrape with rate limiting (2-4s delay)

**Merge priority:** FPF for name/DOB/nationality, ZeroZero for position/foot/height/weight/photo/shirt number. Club: FPF priority, then ZZ.

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
- [ ] In-app Excel import page (`/importar`) — not yet built
- [ ] Seed data: pre-load the 2012 shadow squad — depends on running import script

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

### Phase 3 — External Data & Reports ⬚ IN PROGRESS
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
- [ ] Rating evolution chart (if player has multiple reports)
- [x] FPF scraper built into `full_reset.py`: scrape current club from FPF pages, update `fpf_current_club`
- [ ] FPF data display on player profile + club mismatch alert — `FpfData.tsx`
- [ ] ZeroZero link field on player profile (admin-editable)
- [x] ZeroZero scraper built into `full_reset.py`: scrape stats/history from ZeroZero, update `zz_*` fields
- [ ] ZeroZero data display on player profile (stats, history, photo) — `ZeroZeroData.tsx`
- [ ] Dashboard alerts for club changes (FPF club ≠ DB club)
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

**Deliverable:** Enriched player profiles with scouting reports, current club verification, and match statistics.

### Phase 4 — Polish & Export ⬚ PARTIAL
Final refinements.

- [x] Squad export: PDF, image, text, WhatsApp, print (done in Phase 2)
- [x] Player profile export as image/print (done in Phase 2)
- [ ] Excel export: filtered database download
- [x] Dashboard with core metrics (done in Phase 2)
- [x] Mobile optimizations: iPhone landscape DnD fix, touch sensors with activation constraints, conditional rendering for responsive layouts
- [ ] Role system upgrade: 4 roles (admin, master, scout, scout_externo) — DB migration + middleware + UI guards
- [ ] User management page (`/admin/utilizadores`) — admin: create/edit/delete users, assign 4 roles
- [ ] External scout submission page (`/submeter`) — simplified form for scout_externo role
- [ ] In-app Excel import page (`/importar`) — upload, parse, preview, confirm
- [ ] PWA setup (installable on phone, offline caching for read-only data)

**Deliverable:** Production-ready application.

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
