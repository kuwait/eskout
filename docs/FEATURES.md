# Features — Eskout

Detailed specifications for every feature in the application.

**See also:** [SOP.md](SOP.md) (overview) · [ARCHITECTURE.md](ARCHITECTURE.md) (technical) · [UX.md](UX.md) (navigation & workflows)

---

## 1. Authentication & User Management
- Login page: email + password (Supabase Auth)
- **Login UX:** React 19 `useActionState` for immediate spinner feedback on submit. Pre-sets club cookie during login (single-club users skip middleware redirect loop). Root `loading.tsx` skeleton shown instantly after redirect.
- Four roles: `admin`, `editor`, `scout`, `recruiter`
- Admin: full access — create/edit/delete users, assign roles, approve/reject scout reports, delete players
- Editor: can edit players, manage squads/pipeline, approve/reject scout reports — cannot delete players or manage users. Can access `/admin/pendentes`.
- Scout: can only access `/submeter` (report submission), `/meus-relatorios` (own reports), `/meus-jogadores`, `/preferencias`, individual player profiles — redirected away from all other routes
- Recruiter: see Section 1.1 below
- User management: invite via email (Supabase Auth), set password on first login, soft delete (deactivate/reactivate)
- Session persistence across browser sessions
- Protected routes → redirect to login if unauthenticated
- Social media crawlers (WhatsApp, Facebook, Twitter, Telegram, LinkedIn, Slack, Discord) bypass auth to read OG meta tags
- Role-based route protection via middleware:
  - **Admin only:** `/admin/*` (utilizadores, relatórios) — exception: editors can access `/admin/pendentes`
  - **Admin + Editor:** All main pages (dashboard, campo, jogadores, pipeline, posições, calendário, alertas)
  - **Scout:** Only `/submeter`, `/meus-relatorios`, `/meus-jogadores`, `/mais`, `/preferencias`, `/jogadores/{id}` — all other routes redirect to `/meus-relatorios`
  - **Recruiter:** Blocked from `/exportar`, `/meus-relatorios`, `/submeter`, `/admin`, `/alertas` — redirected to `/campo/real`

### 1.1 Recruiter Role

Recruiters handle squads, pipeline, and calendar — they do not see scouting intelligence or evaluations.

**Route access:**
- Allowed: `/campo/*` (squads), `/pipeline`, `/calendario`, `/posicoes`, `/tarefas`, `/listas`, `/jogadores/{id}` (individual profiles), `/preferencias`
- Blocked: `/exportar`, `/meus-relatorios`, `/submeter`, `/admin/*`, `/alertas`
- Redirect target when blocked: `/campo/real`

**Player profile restrictions (`hideScoutingData`, `hideEvaluations`):**
- Hidden: department opinion badge, observation tier badge, scouting reports section, scout evaluations section, report labels, hybrid rating display
- Visible: basic info (DOB, club, position, foot, contact), club verification, club history (Percurso), observation notes, status history, recruitment status
- Observer names and observer decision remain visible; report-backed data does not

**Player table/card restrictions:**
- Evaluations column/badge hidden (`hideEvaluations` prop)

**Navigation:**
- Same nav items as admin/editor except `recruiterHidden` items are filtered out
- No access to export, scouting submission, or report pages

**Training feedback:**
- Recruiters can add training feedback entries (presence + coach feedback)

### 1.2 Superadmin

A separate privilege flag (`is_superadmin` on `profiles` table), orthogonal to club roles. Superadmins access the `/master` panel (Section 29). Middleware checks `is_superadmin` before granting access — non-superadmins are redirected to `/`.

**Role impersonation:** Superadmins can impersonate any role via `eskout-role-override` cookie. The middleware checks for this cookie, verifies `is_superadmin`, and applies the overridden role for route protection. Implemented in `RoleImpersonator.tsx` in the app shell.

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
- Add player dialog: pre-fills position and birth year filters, hides players already in squad. Position filter matches primary, secondary, and tertiary positions. Player pool fetched via paginated queries (1000-row pages) to bypass Supabase default limit.
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
- Position (GR, DD, DE, DC, MDC, MC, MOC, ED, EE, PL) — matches primary, secondary, and tertiary positions
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
7. **Training Feedback** — See Section 30
8. **Status History** — Change log with admin delete capability (optimistic UI)
9. **Recruitment** — Status badge + dropdown, notes, change history log

**Profile export:** PNG via `html2canvas-pro` with CORS proxy, Print via new window.

**Actions by role:** Admin=full, Editor=edit (not delete), Scout=own notes only, Recruiter=restricted (see Section 1.1)

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

**Desktop:** Kanban board with DnD (card drag between columns + column reorder via header grip). Manual ordering, reorderable columns persisted in localStorage. Horizontal layout.

**Mobile:** Vertical stacked columns, no drag-and-drop (prevents scroll interference and accidental moves). Cards show short name (first + last only). Each card has a ⋮ corner menu opening a dialog with "Mover para" (status list with color dots) and "Remover das abordagens" options. Tapping the card body navigates to player profile.

Every status change logged.

**Auto-tasks:** Pipeline status changes automatically create and complete tasks for assigned users (see Section 28).

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

## 27. Multi-Club Architecture

The application supports multiple clubs on a single platform. Each user can belong to one or more clubs via `club_memberships` (user_id, club_id, role). A user's role is per-club, not global.

### Club Picker (`/escolher-clube`)

- Shown when a user has 2+ clubs and no club cookie is set, or when the user navigates there manually
- Single-club users are auto-selected by middleware (cookie set on redirect, no picker shown)
- Users with no club memberships see a "Sem clube associado" message
- Superadmins always see the picker (plus a link to the `/master` panel)
- Selected club stored in `eskout-club-id` httpOnly cookie (1-year expiry)

### Club Context

- All data queries are scoped to the active club (`club_id` column on players, reports, notes, pipeline, etc.)
- `getActiveClub()` server helper reads the cookie, fetches membership, and returns `{ clubId, userId, role, club }`
- Switching clubs clears the cookie and redirects to the picker
- Routes that don't require a club context: `/escolher-clube`, `/preferencias`

### Club Settings (`/definicoes`)

Admin-only page for the active club. Two sections:
1. **Club Identity** — edit club name and logo URL
2. **Bulk External Data Update** — batch-scrape all players with FPF/ZeroZero links. Source selection (FPF, ZeroZero, or both). Progress bar with counts (processed, updated, errors). Runs in batches of 10.

## 28. Tasks (`/tarefas`)

Personal TODO list combining manual tasks and auto-generated tasks from the recruitment pipeline. Accessible to admin, editor, and recruiter roles. Scouts are excluded.

### Manual Tasks
- Create with title, optional due date, optional player link
- Admin can create tasks assigned to other club members
- Toggle completion (checkbox). Completed tasks show with strikethrough.
- Pin tasks to keep them at the top
- Edit title, due date, player link
- Delete: users can delete their own manual tasks; admin can delete any

### Auto-Generated Tasks (Pipeline)

Automatically created when pipeline status changes trigger action items:

| Pipeline Status | Task Source | Example |
|----------------|-------------|---------|
| `em_contacto` (In Contact) | `pipeline_contact` | "Contactar [Player]" — assigned to `contact_assigned_to` |
| `vir_treinar` (Come Train) | `pipeline_training` | "Registar feedback do treino" — assigned to `contact_assigned_to` |
| `reuniao` (Meeting) | `pipeline_meeting` | "Reuniao — [Player]" — assigned to each `meeting_attendees` member |
| `assinar` (Signing) | `pipeline_signing` | "Assinatura — [Player]" — assigned to each `signing_attendees` member |

- Auto-tasks are created idempotently (skips if uncompleted task with same user+player+source exists)
- Moving a player out of a status auto-completes tasks from the old status
- Uncompleting an auto-task removes any pending duplicate to avoid constraint violations

### Flagged Notes Integration

The tasks page also displays flagged observation notes (important/urgent priority) in a separate section, replacing the standalone `/alertas` page as the primary entry point.

### UI

- Badge count of pending tasks shown in nav
- Admin can view other users' tasks via a user selector dropdown
- Realtime updates via broadcast

## 29. Superadmin Panel (`/master`)

Platform-level management interface, accessible only to users with `is_superadmin = true`. Uses its own layout with a purple-accented sidebar (desktop) and hamburger drawer (mobile), separate from the club-scoped app shell.

### Dashboard (`/master`)
- KPI cards: total clubs (excludes test), total users (unique across real clubs), total players, total reports
- Activity section: online now count (last 2 min), active in last 24h
- This month: players added, reports submitted

### Clubs (`/master/clubes`)
- List of all clubs (excludes test clubs) with name, slug, logo, member count, active/inactive status
- **Create club form** at the top
- Click a club → detail page (`/master/clubes/{id}`)

### Club Detail (`/master/clubes/{id}`)
- **Club identity**: edit name and logo URL
- **Active toggle**: activate/deactivate club. Deactivation requires typing the club name to confirm. Inactive clubs cannot be accessed by members.
- **Feature toggles**: per-club on/off switches for optional features (see Section 31)
- **Members list**: shows all members with name, email, role. Inline role dropdown to change roles. Remove button.
- **Invite form**: invite new user by name + email + role. Creates Supabase Auth user and club membership.

### Users (`/master/utilizadores`)
- Lists all users across all real clubs (excludes test-only users)
- Shows: email, full name, superadmin flag, email confirmed status, last sign-in, creation date
- Club memberships listed per user (club name + role)

### Online Activity (`/master/online`)
- **Online now**: users with `last_seen_at` within 2 minutes. Shows name, club, role, current page, device (mobile/desktop), session duration.
- **Active 24h**: users active in the last 24 hours
- **Peak today**: from `platform_daily_stats` table
- **Activity heatmap**: 7x24 grid (day of week x hour) from `status_history` over last 30 days
- **Activity feed**: last 30 status changes with player name, user name, field changed, old/new values
- **Filters**: excludes test-only users and users with no club membership
- Client-side auto-refresh via polling

### Navigation
Sidebar items: Dashboard, Clubes, Utilizadores, Online. Bottom links: Trocar Clube (→ `/escolher-clube`), Preferencias, Sair (logout).

## 30. Training Feedback

Presence tracking and coach feedback after a player trains at the club. Displayed as a section in the player profile.

**Data model:** `training_feedback` table with `club_id`, `player_id`, `author_id`, `training_date`, `escalao`, `presence`, `feedback` (text), `rating` (1-5).

**Presence values:**

| Value | Label (PT) | Visual |
|-------|-----------|--------|
| `attended` | Veio | Green badge |
| `missed` | Faltou | Red badge |
| `rescheduled` | Reagendado | Amber badge |

**Permissions:**
- Create: admin, editor, recruiter (scouts cannot)
- Update: author or admin
- Delete: author or admin

**UI:** Inline add form in player profile with date picker, escalao pre-fill, presence selector, optional feedback text, optional 1-5 rating. Entries listed chronologically. Zod validation on server.

## 31. Feature Toggles

Clubs can enable or disable optional features. Configured per-club by superadmins via the club detail page in the master panel (Section 29). Stored as a JSON `features` object on the `clubs` table. Default is all enabled (`features[key] !== false`).

**Available toggles:**

| Key | Label | Controls |
|-----|-------|----------|
| `pipeline` | Pipeline (Abordagens) | Pipeline page + nav item |
| `calendar` | Calendario | Calendar page + nav item |
| `shadow_squad` | Plantel Sombra | Shadow squad panel + nav item |
| `scouting_reports` | Relatorios de Observacao | Admin report review + nav item |
| `scout_submissions` | Submissoes Scout | Scout submission page + Meus Relatorios |
| `export` | Exportar | Export page + admin nav item |
| `positions_view` | Vista Posicoes | Positions page |
| `alerts` | Notas Prioritarias | Flagged notes / alerts |

**How it works:**
- `getActiveClub()` returns the club's features object
- `filterNavItems(role, features)` and `filterAdminItems(features)` hide nav items for disabled features
- Nav items and admin items have a `feature` property linking them to a toggle key
- A feature is considered enabled if `features[key] !== false` (opt-out model, not opt-in)

## 32. Player Lists ("Listas") (`/listas`)

Generic multi-list system for personal player bookmarks. Evolved from the original "A Observar" feature. Each user can create unlimited named lists with emoji icons. "A Observar" is a system list (auto-created, non-deletable).

**Access:** Admin, editor, recruiter. Scouts are excluded.

**Data model:**
- `player_lists` table: `id`, `club_id`, `user_id`, `name`, `emoji`, `is_system`, `created_at`, `updated_at`. Unique constraint on `(user_id, name, club_id)`.
- `player_list_items` table: `id`, `list_id` (FK), `player_id` (FK), `note`, `sort_order`, `added_at`. Unique constraint on `(list_id, player_id)`. CASCADE delete on list removal.

**Lists page (`/listas`):**
- Grid of list cards showing emoji, name, item count, last added date
- Create new list: inline form with name + emoji picker (20 curated emojis)
- Rename/delete custom lists (system lists cannot be renamed or deleted)
- Cards have equal height within rows

**List detail (`/listas/[id]`):**
- Player cards showing photo, name, nationality flag, position (color-coded badge), club (with logo), DOB
- Inline note editing per player (pencil icon)
- Remove player from list (trash icon with confirmation dialog)
- "Adicionar" button opens AddPlayerDialog (same pattern as AddToSquadDialog: all players fetched server-side, client-side fuzzyMatch + filters for position, club, opinion, foot, year)
- Click player card → navigate to player profile

**ListBookmarkDropdown (player profile):**
- Bookmark icon in player profile header
- Popover with checkboxes for all user's lists
- Toggle individual list membership (optimistic count update)
- Inline "Nova lista" creation
- Filled bookmark icon when player is in any list

**Admin view:** Admin sees a "Todas" panel on the lists page showing all users' lists across the club, grouped by owner name.

**Export:** Admin and editor can export a list as Excel (`.xlsx`). Columns: Nome, Clube, Posição, Data Nasc., Nacionalidade, Nota, Adicionado.

**Realtime:** `player_lists` and `player_list_items` in broadcast tables. List detail auto-refreshes on changes.

**Backward compatibility:** `/a-observar` redirects to `/listas`. Bridge functions (`addToObservationList`, `removeFromObservationList`, `isPlayerObserved`) delegate to the new system list.

## 34. Player Comparison (`/comparar`)

Side-by-side comparison of 2-3 players. Accessible to all roles except scout. Sub-menu item under Jogadores (below Listas) in sidebar and mobile drawer.

**Route:** `/comparar?ids=123,456,789` — player IDs in query string.

**Views:**
- **Desktop:** CSS grid table with label column + player columns. Section headers span full width. Numeric values highlighted green for best.
- **Mobile:** Horizontal scroll-snap cards with tab bar for player switching. Each card shows all sections vertically.
- **Empty state:** Prompt to add players via inline picker dialog.

**Sections compared:** Dados Básicos (DOB, age, nationality, foot, number), Posição (primary/secondary/tertiary with MiniPitch), Físico (height, weight), Avaliação (rating, opinion, decision — hidden for recruiter), Pipeline (status, real/shadow squad), Relatórios (count, average, last date — hidden for recruiter), Estatísticas ZZ (games, goals).

**Saved comparisons:**
- Table `saved_comparisons` (migration 056): `id`, `club_id`, `user_id`, `name`, `player_ids int[]`, `created_at`.
- Max 10 per user. "Guardar" button hidden when current comparison already saved or at limit.
- "Guardadas" dropdown in header shows other saved comparisons (excludes current). Each entry has delete button.
- "Eliminar" button shown when viewing a saved comparison — deletes and redirects to `/comparar`.
- "Nova" button to start fresh comparison.

**Inline player picker:** Same pattern as AddToSquadDialog — all players fetched server-side via `getPickerPlayers()`, client-side `fuzzyMatch()` + filters (position, club, opinion, foot, year). Max 50 results shown.

**Server action:** `src/actions/comparisons.ts` — `getSavedComparisons()`, `saveComparison()`, `deleteComparison()`. Zod validation via `saveComparisonSchema`. Realtime broadcast on mutations.

---

## 35. YouTube Media Links (Player Videos)

"Media" section in player profile for YouTube video links. All roles can view and add videos.

**Data model:** `player_videos` table (migration 057) — `id`, `club_id`, `player_id`, `url`, `video_id`, `title`, `thumbnail`, `note`, `added_by`, `created_at`. Separate table (not a column on `players`) to support multiple videos per player with metadata.

**YouTube oEmbed:** On add, server fetches `https://www.youtube.com/oembed?url=...&format=json` to extract title + thumbnail. No API key needed. Best-effort — fails gracefully, fallback to YouTube thumbnail URL pattern.

**Supported URL formats:** `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`.

**UI in player profile:**
- "Media" section after Percurso, before Observação
- Grid of video cards (2 columns) with thumbnail + play overlay + note/title
- Click opens modal with embedded iframe (`youtube-nocookie.com` for privacy)
- "Adicionar vídeo" form: URL input + optional note (max 100 chars)
- Delete button on hover (respects permissions)

**Permissions:**
- All roles can view and add videos
- Admin/editor can delete any video
- Scout/recruiter can only delete their own videos

**Limits:** Max 10 videos per player. Duplicate video ID detection.

**Server action:** `src/actions/player-videos.ts` — `getPlayerVideos()`, `addPlayerVideo()`, `deletePlayerVideo()`. Zod validation via `addVideoSchema`. Realtime broadcast on mutations.

---

## 33. Themes & Preferences (`/preferencias`)

User-level visual customization. Accessible to all roles (including scouts). Stored in localStorage per device.

**10 themes** (8 light + 2 dark):

| Theme | Description | Font |
|-------|------------|------|
| Eskout | Classic black and white (default) | Inter |
| Ocean | Professional blue | DM Sans |
| Forest | Grass green | Inter |
| Sunset | Warm orange tones | DM Sans |
| Berry | Elegant purple | Space Grotesk |
| Sand | Earthy neutral | DM Sans |
| Rose | Soft pink | DM Sans |
| Slate | Modern gray | Space Grotesk |
| Midnight | Dark blue (dark mode) | Space Grotesk |
| Carbon | Dark neutral (dark mode) | Inter |

**How it works:**
- `ThemeProvider` context wraps the app, reads/writes `eskout-theme` key in localStorage
- Anti-FOUC script in `layout.tsx` applies theme class before first paint
- Each theme defines CSS custom properties for colors + font-family override in `globals.css`
- `ThemePicker` component renders a grid of theme cards with color preview bars, description, font name, and active checkmark
- Dark themes (Midnight, Carbon) include CSS overrides for hardcoded `bg-white`/`text-neutral-*` classes
