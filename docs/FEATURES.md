# Features — Eskout

Detailed specifications for every feature in the application.

**See also:** [SOP.md](SOP.md) (overview) · [ARCHITECTURE.md](ARCHITECTURE.md) (technical) · [UX.md](UX.md) (navigation & workflows)

---

## 1. Authentication & User Management
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

## 2. Age Group Selector
- Three display variants:
  - **Dropdown** — standard select, used in simple contexts
  - **Tabs** — horizontal scrollable pills, used for pages with many options
  - **Navigator** — arrow-based `← Sub-15 →` control with dropdown on tap; used on squad and pipeline pages where the selected group must always be visible
- Navigator variant: compact card with prev/next arrows, tap name opens dropdown with all options. Supports "Todos" option when applicable.
- Remembers selection per page across sessions (localStorage)
- Age groups determined from data in database
- Shows: "Sub-15" or birth year (e.g., "2011") depending on context

## 3. Dashboard
For the selected age group:
- **Counters:** Total scouted, in real squad, in shadow squad, by recruitment status
- **Department opinion breakdown:** Bar chart or badges showing count per opinion
- **Position coverage:** For each of the 10 positions → count in real squad / count in shadow squad / total candidates
- **Recent changes:** Last 10 status changes (date, author, player, change)
- **Alerts:** Players whose FPF club differs from DB club, positions with zero shadow squad candidates

## 4. Real Squad vs Shadow Squad (PRIMARY VIEW)

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
- Export menu with PDF, image, text, WhatsApp, and print options (see Section 11)

**Formation view:**
- Football pitch graphic with position zones (formation slots)
- Visual overlay of players on a pitch layout
- DC sub-slots (DC_E/DC_D) for left/right central defenders
- **Desktop (lg+):** horizontal pitch layout with columns for position groups
- **Mobile/Tablet (<lg):** vertical pitch layout, positions stacked top-to-bottom. Compact cards showing name + club; tap to expand.
- Drag-and-drop between positions and within positions for reordering
- **Conditional rendering:** Desktop and mobile layouts are conditionally rendered (not CSS-hidden) to avoid duplicate `@dnd-kit` droppable IDs. Uses `useIsDesktop()` at 1024px breakpoint.
- **iPhone landscape fix:** Breakpoint at `lg` (1024px) ensures iPhone landscape (~844px) uses the mobile vertical layout

## 5. Player Database
Full table/list of all players (fetched once, filtered client-side):

**Search:** Instant fuzzy search by name (client-side)

**Filters:**
- **Birth year** — dropdown with all available years (replaces age group selector on this page)
- Position (GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL)
- Club, Department opinion, Foot (Dir, Esq, Amb), Recruitment status
- **Date of birth range** — collapsible panel with from/to date pickers
- Shadow squad (yes/no), Real squad (yes/no)

**Sorting:** By any column

**Color coding (department opinion):** Green=Boavista, Blue=1ª Escolha, Yellow=Acompanhar, Orange=Urgente/2ª Escolha, Gray=Por Observar, Red=Sem interesse, Purple=Potencial

**Mobile:** Card layout with eval rating circle, name, position, club, badges. Tap → profile.

**Desktop table columns:** Avaliação, Nome (with photo), Nasc., Posição (color-coded pills + pitch hover), Opinião, Estado. Resizable columns, sortable headers.

## 6. Player Profile
Dedicated page `/jogadores/{id}`.

**Header:** Name, age group, position dots (green=primary, yellow=secondary, orange=tertiary), opinion badge. Photo avatar with fallback to initials.

**Multi-position support:** Up to 3 positions (primary, secondary, tertiary) with color-coded dots on mini pitch.

**Sections (collapsible):**
1. **Basic Info** — DOB, age, club, number, foot, contact, referred by, observer(s), eval, decision, notes
2. **External Links** — FPF button, ZeroZero button
3. **Club Verification** — FPF vs DB vs ZeroZero club comparison
4. **Percurso (Club History)** — Career stats table from ZeroZero: season, club, escalão (pill badge), games (blue), goals (green). Current season hero card with aggregated totals. Career totals row. Responsive: mobile below Info Básica, desktop in right column. Visible to all roles.
5. **Scouting Reports** — Chronological cards from PDFs with rating, decision, expandable details
6. **Observation Notes** — Scout notes with priority styling, delete button
7. **Status History** — Change log with admin delete capability (optimistic UI)
8. **Recruitment** — Status badge + dropdown, notes, change history log

**Profile export:** PNG via `html2canvas-pro` with CORS proxy, Print via new window.

**Actions by role:** Admin=full, Master=no delete, Scout=own notes only, Scout Externo=no access

## 7. Recruitment Pipeline

| Status | Label (PT) | Color |
|--------|-----------|-------|
| `pool` | Pool | Gray |
| `shortlist` | Shortlist | Blue |
| `to_observe` | A Observar | Yellow |
| `target` | Alvo | Orange |
| `in_contact` | Em Contacto | Purple |
| `negotiating` | Em Negociação | Dark Blue |
| `confirmed` | Confirmado | Green |
| `assinou` | Assinou | Dark Green |
| `rejected` | Rejeitado | Red |

Kanban board with DnD, manual ordering, reorderable columns (localStorage). Desktop=horizontal, Mobile=vertical. Every status change logged.

## 8. Position View
For each of the 10 positions: real squad / shadow squad / pool breakdown. Visual coverage indicator.

## 9. Add New Player (Link-First Form)
1. Paste FPF/ZeroZero URLs → auto-scrape → pre-fill form
2. Manual fallback available
3. Minimum: Name, DOB, Club
4. Duplicate detection on save (FPF link, ZZ link, name+DOB)
5. Defaults: status=`pool`, opinion=`Por Observar`

## 10. Excel Import
Upload `.xlsx`, parse with hyperlinks, auto-detect age group, duplicate detection, preview before import. Admin only.

## 11. Export
**Squad:** PDF, image, text, WhatsApp, print. **Database:** Excel (filtered), PDF (filtered), JSON (full backup). Admin only.

## 12. Observation Notes
Content + match context + priority (normal/importante/urgente). Priority styling with colored borders and icons. Admin deletes any, author deletes own.

## 13. Calendar
Month grid + list view. Event types: Observação, Jogo, Reunião, Outro. Player linking, color coding, export.

## 14. Player Photos
`photo_url` field, avatar component with initials fallback.

## 15. DC Sub-Slots
Left/right DC classification within squad view (DC_E/DC_D).

## 16. Scout Report Submission (`/submeter`)
FPF link required → auto-scrape → ZeroZero auto-find → evaluation form (position, competition, match, rating 1-5, decision, physical profile, strengths, weaknesses). Inline validation, phone auto-format.

## 17. Flagged Notes Page (`/alertas`)
Important/urgent notes across all players. Badge counts in nav. Server-side fetch.

## 18. My Reports (`/meus-relatorios`)
Scout's own reports list + detail view. Status badges (Pendente/Aprovado/Rejeitado).

## 19. Admin Report Review (`/admin/relatorios`)

**3 sub-pages:**
1. **Relatórios** — KPI cards, highlight chips, searchable/filterable list, slide-over detail, URL pagination
2. **Scouts** — 365-day activity heatmap, per-scout stats with sparklines
3. **Consenso** — multi-scout divergence cards, severity badges, dismiss to localStorage, masonry layout

**Approve** → creates player from report data, links to existing if duplicate. **Reject** → marks rejected.

## 20. Observation Tier
Computed: Observado (has reports) > Referenciado (has referred_by) > Adicionado (neither). Icon badge + filter.

## 21. Hybrid Rating System
Primary = report average (decimal) if available, else manual observer_eval (integer). Color mapping via `RATING_COLORS`.

## 22. Weekly Calendar View
Month + week views with client-side toggle, popover picker, smart navigation. URL params for view state.

## 23. Scout Evaluations
Per-scout star rating (1-5), global average combining all evals + report ratings. Detail popup with breakdown.

## 24. Profile UX Improvements
Empty sections hidden, completeness card, edit form redesign (pitch picker, foot toggles, jersey number grid, nationality dropdown with flags).

## 25. Club Logos
Scraped from FPF/ZeroZero, stored in `club_logo_url`. ClubBadge component with hover popover.

## 26. Table UX Improvements
Middle-click new tab, photo hover popover, completeness suggestions, invalid URL filtering.
