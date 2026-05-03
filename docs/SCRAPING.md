# Scraping Scripts — Eskout

FPF, ZeroZero, and PDF report extraction — both standalone Python scripts and in-app server actions.

**See also:** [SOP.md](SOP.md) (overview) · [DATA.md](DATA.md) (data sources)

---

## 1. FPF Scraper (`scripts/fpf_scraper.py`)

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

---

## 2. ZeroZero Scraper (`scripts/zerozero_scraper.py`)

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

---

## 3. Report Extractor (`scripts/extract_reports.py`)

**Purpose:** Download PDFs from Google Drive and extract structured data.

**Prerequisites:**
- Google Cloud project with Drive API enabled
- Service Account with JSON key
- Share the Google Drive report folder with the Service Account email (read access)

**Environment:** `GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/credentials.json`

**Process:**
1. Read players with `report_link_*` from Supabase
2. Extract Google Drive file ID from URL
3. Download PDF via Google Drive API
4. Extract text with `pdfplumber`
5. Parse structured fields (template is fixed)
6. Insert into `scouting_reports` table

**CLI:**
```bash
python scripts/extract_reports.py --all
python scripts/extract_reports.py --new-only
python scripts/extract_reports.py --player-id 42
python scripts/extract_reports.py --age-group Sub-14
python scripts/extract_reports.py --retry-errors
```

---

## 4. Anti-Blocking Strategy

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

---

## 5. Google Drive API Rate Limiting

- 1-2 second delay between downloads
- Process in batches of 50, pause 30s between batches
- Local PDF cache (don't re-download)
- Retry with backoff on 429/500

---

## 6. FPF HTTP Layer (`fpf-fetch.ts` + `fpf-playwright.ts`)

**⚠️ Local-dev only.** All FPF scraping (player profiles, club imports, competition match sheets, image proxy fallback) routes through the user's local Brave browser via Chrome DevTools Protocol (CDP). Cloudflare blocks any server-side TLS fingerprint we tried (cycletls JA3, plain Node fetch) — the only deterministic bypass is driving the user's real, logged-in browser. **This means FPF features do not work in production (Vercel) — they only work when the dev server runs locally with Brave open via CDP.**

### Setup

```bash
./scripts/fpf_browser.sh   # Relaunches Brave with --remote-debugging-port=9222 on user's real profile
```

While that Brave window stays open, `fpfFetchViaPlaywright` connects via CDP and reuses the user's real session (cookies, cf_clearance, fingerprint, history). When the script isn't run, the code falls back to `chromium.launchPersistentContext` with stealth init scripts, but Cloudflare will likely block it.

### Single entry point: `fpfFetch(url, options)`

`src/actions/scraping/fpf-fetch.ts` is the unified HTTP layer for all `*.fpf.pt` calls. Routes to Playwright/CDP for everything FPF (both `www.fpf.pt` and `resultados.fpf.pt`). Features:

- **Global throttle:** 3s minimum spacing between requests, serialized via promise queue (prevents N parallel workers firing simultaneously). Shared across all FPF subdomains.
- **`FpfRateLimitError`:** Thrown on 429. Callers MUST NOT retry — retrying a 429 only extends the Cloudflare 1015 ban window. `withRetry` helpers across the codebase abort immediately on this error.
- **Cookie merging:** When session cookies are passed by callers (e.g. DNN sessions), they're appended to `cf_clearance` instead of replacing it.
- **`FpfFetchResult`:** Fetch-like API + parsed `setCookies: string[]`.

### Image proxy fallback (`/api/image-proxy`)

When plain `fetch(url)` fails for FPF-hosted images (Cloudflare 403), falls back to `fpfFetchBinaryViaPlaywright` which loads the image through the user's Brave page (same network stack as `<img src=…>`). Used by the photo-match feature in the competition stats UI.

---

## 7. In-App Scraping (Server Actions)

Server actions in `src/actions/scraping.ts` scrape FPF and ZeroZero directly from the app:

### FPF Parsing
Extracts `var model = {...}` embedded JSON — fields: FullName, CurrentClub, Image, BirthDate, Nationality, PlaceOfBirth.
- **Date formats:** `dd/MM/yyyy`, `yyyy-MM-dd`, Portuguese text (e.g. "27 de março de 2012"), .NET JSON date (`/Date(1332806400000)/`), native Date fallback
- **Portuguese month regex:** Uses `[a-záàâãéèêíìóòôõúùûç]+` (not `\w+`) because JS `\w` doesn't match accented characters like `ç`, `ã`
- **Birth country fallback:** If no explicit birth country field, uses Nationality as fallback

### ZeroZero Parsing
- **Encoding:** ISO-8859-1 for player pages (decoded manually via `TextDecoder`), UTF-8 for autocomplete
- **JSON-LD:** Person schema — image, name, birthDate, nationality, height, weight, worksFor
  - `worksFor` can be string, object, array, or a string containing a JSON array — all formats handled
- **Sidebar card-data** (most reliable): Position, Foot, DOB, Nome, Clube atual, Nacionalidade, País de Nascimento, Altura, Peso
  - DOB formats: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd`, `yyyy-MM-dd (XX anos)`
- **Header:** Shirt number from `<span class="number">7.</span>`, name from `<h1 class="zz-enthdr-name">`
- **Career table:** Season, club, games, goals per row
  - Two HTML layouts: rich (`micrologo_and_text`, 6 TDs with offset) vs simple (plain links, 4-5 TDs)
  - **Cromo cards fallback:** ZZ paginates career table behind login ("+N registos"). Cromo cards in the page header contain club+team+season for ALL seasons — parsed as fallback with games/goals=0
- **Captcha detection:** Detects recaptcha redirects and empty/invalid responses

### Country Name Normalization
`normalizeCountry()` fixes common FPF accent issues (e.g. "Guine Bissau" → "Guiné-Bissau").

### Photo Dedup Logic
- FPF photo only shown if player has NO photo yet
- ZZ photo only shown if URL genuinely changed
- Club logo auto-saved silently

### Client-Side Rate Limiting & Progress

All ZeroZero requests from the browser go through `/api/zz-proxy` and are rate-limited at the client level:

- **Rate limiter in `fetchViaProxy`**: enforces 300–1200ms random delay between consecutive ZZ requests
- **Multi-strategy search**: additional 2–4s between name variants, 1.5–3s before DOB verification
- **Progress callback**: `setZzProgressCallback()` allows UI to show live step descriptions
- **RefreshPlayerButton**: uses `useRef` + polling (150ms interval) to escape `useTransition` batching and display live progress (blue animated tooltip under button)

Steps shown during refresh:
1. "A consultar perfil ZeroZero…" (or search variants if no ZZ link)
2. "A verificar candidato: [name]…" (DOB verification)
3. "A consultar FPF e a processar…" (server action)

### Server Actions
| Action | Purpose |
|--------|---------|
| `scrapePlayerFpf(playerId)` | Scrape FPF for existing player |
| `scrapePlayerZeroZero(playerId)` | Scrape ZeroZero for existing player |
| `scrapePlayerAll(playerId)` | Scrape both, merge, return changes |
| `scrapeFromLinks(fpfLink?, zzLink?)` | Scrape from raw URLs (for Add Player flow) |
| `applyScrapedData(playerId, updates)` | Apply selected scraped fields |
| `autoScrapePlayer(playerId, fpfChanged, zzChanged)` | Triggered after profile save if links changed |
| `bulkScrapeExternalData(offset, limit, sources)` | Batch scrape with rate limiting |

### FPF Club Import (In-App)

Bulk import registered players from FPF club pages. Supports multi-club queues with batch processing and retry logic. Uses FPF's DNN/AngularJS internal APIs:

| Endpoint | Method | DNN Headers | Purpose |
|----------|--------|-------------|---------|
| `/DesktopModules/MVC/SearchClubs/Default/GetClubsByName` | POST | ModuleId: 3220, TabId: 848 | Club autocomplete search |
| `/DesktopModules/MVC/ClubDetail/Default/GetClubPlayers` | GET | ModuleId: 3221, TabId: 1499 | Registered players by escalão |

**Season ID formula:** `95 + (startYear - 2015)` — e.g. 2025/26 season → `105`.

**FPF ClassId → Escalão mapping:**
| ClassId | Escalão |
|---------|---------|
| 10 | Sub-7 (Petiz) |
| 9 | Sub-9 (Traquina) |
| 8 | Sub-11 (Benjamim) |
| 6 | Sub-13 (Infantil) |
| 5 | Sub-15 (Iniciado) |
| 4 | Sub-17 (Juvenil) |
| 3 | Sub-19 (Júnior) |
| 2 | Sénior |

**Cookie requirement:** Club player list endpoint requires session cookies — fetched by visiting the club detail page first. Cookie fetch is wrapped in `withRetry` for resilience.

**Batch processing:**
- `importFpfPlayerBatch` processes up to 10 players per HTTP request with N concurrent workers (default 5)
- Eliminates ~4s Next.js server action overhead per player (was the main bottleneck with individual calls)
- Returns `BatchLogEntry[]` with per-player timing, action, and event type for real-time client display
- Failed players get a second retry round within the batch (2s backoff between retries)

**Retry logic (`withRetry`):**
- Wraps FPF HTTP requests with exponential backoff: 3s → 6s → 12s + random jitter (0-2s)
- 3 retry attempts before giving up
- Applied to: escalão player list fetch (cookie + API call), individual player profile scrapes

**FPF throttling behavior (observed):**
- Single requests: ~5s response time
- 5 concurrent: ~5-7s response time (no failures)
- Higher concurrency: FPF soft-throttles (12-15s responses) but doesn't hard-block
- ~2000 requests in a session: no blocks observed with 5 concurrent workers

| Action | Purpose |
|--------|---------|
| `searchFpfClubs(searchText)` | Search clubs by name (autocomplete) |
| `getFpfClubPlayers(clubId, classId)` | Fetch registered players for club + escalão (with retry) |
| `importFpfPlayerBatch(players, clubName, concurrency)` | Batch import/update players (with retry + log) |
| `finishFpfImport()` | Revalidate pages after batch import |

### Merge Priority
FPF for name/DOB/nationality/birthCountry, ZeroZero for position/foot/height/weight/photo/shirt number. Club: FPF priority, then ZZ.

---

## 8. FPF Competition Scraping (`src/actions/scraping/fpf-competitions/`)

**Purpose:** Scrape FPF competition match sheets — lineups, goals, cards, substitutions, minutes. Detect "playing up" players and provide player linking to eskout DB.

**Route:** `/master/competicoes` (superadmin only)

### Architecture

| File | Purpose |
|------|---------|
| `browse.ts` | Discover fixtures/matches from competition pages |
| `fpf-data.ts` | Types for FPF API responses |
| `scrape-match.ts` | Parse individual match sheet HTML (lineups, events) |
| `scrape-competition.ts` | Orchestrate fixture scraping + DB insertion |
| `link-players.ts` | Auto/manual link competition players to eskout DB |
| `playing-up.ts` | Detect players competing above their age group |
| `stats.ts` | Aggregated stats queries (scorers, minutes, cards) |
| `stats-utils.ts` | Pure aggregation helpers (no server deps) |
| `permissions.ts` | Access control helpers |

### Match Sheet Parser (`scrape-match.ts`)

Parses HTML from `resultados.fpf.pt/Match/GetMatchInformation?matchId=XXX`:

- **Team names:** From `game-resume` section `<strong>` tags, OG meta title, or Club/Logo alt attributes
- **Lineups:** From `lineup-team home-team` / `lineup-team away-team` divs, `<div class="player">` entries
- **Goals:** From `info-goals` section (home=text-right, away=text-left columns)
- **Substitutions:** Each `<div class="timeline-item">` block parsed in isolation (avoids cross-event leakage where minute from earlier event was paired with later sub)
- **Cards:** From lineup section `icon-yellowcard`/`icon-redcard` CSS classes (no minute available)
- **Player FPF IDs:** From `/Player/Logo/{id}` (logo ID, NOT profile ID — these are different systems)

**Apostrophe encoding tolerance:** Minute markers come from FPF in two forms — HTML-encoded `45&#39;` and literal `45'` (varies by page, e.g. AF Porto Sub-17 II Divisão uses literal). Goal/substitution/card regexes accept both, plus typographic variants (`'`/`'`/`′`/`'`). Regression tests in `__tests__/parse-match-2376960.test.ts` (literal-apostrophe fixture) and `parse-match.test.ts` (apostrophe variant tolerance).

**Recovery action:** `reparseCompetitionMatches(competitionId)` re-fetches every match in a competition and re-runs the parser, preserving existing `eskout_player_id` mappings. Used after parser fixes to recover suplentes that were silently dropped (e.g. apostrophe regression). Triggered by "Re-parse jogos" button in `CompetitionStatsClient.tsx`.

### FPF Player ID Extraction (`src/lib/fpf/extract-fpf-id.ts`)

Pure helper (no `'use server'`) for parsing FPF player IDs out of any FPF URL. Three recognized patterns:
- `/Player/Logo/<id>` — match-sheet photos (`resultados.fpf.pt`)
- `/playerId/<id>` — `Ficha-de-Jogador` profile URLs (`www.fpf.pt`)
- `?id=<id>` — `imagehandler.fpf.pt/ScoreImageHandler.ashx` photos (only matched on this host to avoid tracking-param false positives)

Used by `link-players.ts` to resolve eskout players whose `fpf_link` and `photo_url` may carry different IDs (FPF rotates IDs over time).

### Player Linking (`link-players.ts`)

Auto-link strategies (in order):
1. **FPF player ID** — exact numeric match against `players.fpf_player_id`, `fpf_link` parsed via `extractFpfPlayerIdFromUrl`, AND `photo_url` parsed for legacy imports without `fpf_player_id`
2. **Strategy 2 (name + club + age) DISABLED** — same name at same club too often means siblings, not the same person. Players without an FPF ID match end up in "Não Ligados" for manual review.

**Auth:** `requireSuperadmin()` returns a service-role client (bypasses RLS) — eskout players span all clubs and the regular client would only see players in the active club, missing cross-club matches.

**Pagination:** All match-ID fetches use `getAllMatchIds()` (paginated 1000 at a time) — Postgrest's default cap was silently dropping rows on competitions with > 1000 matches.

**Sanity filter:** `isAgeCompatible(dob)` rejects biologically impossible candidates from auto-link (e.g. a 2016-born player in a Sub-17 competition).

**Recovery:** `unlinkSuspiciousPlayers(competitionId)` removes existing eskout links where the linked player's DOB is implausible for the competition — used to clean up legacy garbage from before strategy 2 was disabled.

Manual linking via "Não Ligados" tab:
- **Match direto** (autoLink): exact FPF ID or DOB match — one-click submit
- **Dúvidas** (ambiguous): multiple candidates, manual pick. Includes "🖼️ Auto-match por foto" button — hashes (SHA-256) all candidate photos via `/api/image-proxy`, auto-links when exactly 1 candidate has identical bytes
- **Provavelmente novos** (crossClubOnly): candidates exist but all from different clubs. Collapsed by default — usually new players sharing a name with existing ones, but expandable for actual transfers
- **Sem match** (noMatch): grouped by club, no candidates found

### Playing Up Detection (`playing-up.ts`)

- Uses a **PostgreSQL RPC** (`get_playing_up_players`) for performance — single SQL query replaces ~15 sequential HTTP requests
- SQL function in `supabase/migrations/067_playing_up_rpc.sql`, `p_offset` added in `114_playing_up_pagination.sql`
- Server action paginates via `p_offset` (1000-row chunks) — Postgrest caps at `db-max-rows`, default 1000, so competitions with many series previously dropped rows silently
- Default limit raised to 10000 (was 500 — internal admin tool, payload size not a concern)
- Aggregates match_players + joins players table for DOB in one query
- Two DOB strategies: (1) `eskout_player_id` direct link, (2) `fpf_player_id` string match
- Players born AFTER `expected_birth_year_end` → "playing up" (e.g. 2012 in Sub-15 = +1 year)
- UI: birth-year filter chips, sortable columns, paginated render (PAGE_SIZE=100), sanity guard caps `years_above` at 4 (filters out impossible linkages from bad legacy auto-links)

### Future Matches

- Unplayed matches saved as skeletons (teams + date, no lineup/events)
- Re-scrape detects skeleton (`home_score IS NULL`) and replaces with full data when match is played
