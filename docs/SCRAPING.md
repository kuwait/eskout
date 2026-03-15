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

## 6. In-App Scraping (Server Actions)

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

## 6. FPF Competition Scraping (`src/actions/scraping/fpf-competitions/`)

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
- **Substitutions:** From timeline `icon-substitution.png` + `<span class="in/out">` tags
- **Cards:** From lineup section `icon-yellowcard`/`icon-redcard` CSS classes (no minute available)
- **Player FPF IDs:** From `/Player/Logo/{id}` (logo ID, NOT profile ID — these are different systems)

### Player Linking (`link-players.ts`)

Three auto-link strategies (in order):
1. **FPF player ID** — exact numeric match (most reliable, but Logo ID ≠ Profile ID)
2. **Exact name + club match** — case-insensitive name AND `clubsMatch()` must pass. Duplicate names → manual.

Manual linking via "Não Ligados" tab:
- Suggestions filtered by same club first, cross-club fallback marked with "clube ≠"
- Inline fuzzy search (multi-word across name + club)
- FPF photo + eskout photo shown for visual comparison
- FPF profile link for verification

### Playing Up Detection (`playing-up.ts`)

- Compares player DOB (from linked eskout player) to competition's `expected_birth_year_end`
- `expected_birth_year = ref_year - escalão_number` (e.g. Sub-15 2025/26 → ref 2026 → born 2011)
- Players born AFTER expected year → "playing up" (e.g. 2012 in Sub-15 = +1 year)
- Only uses DOB from properly linked players (no fuzzy name guessing)

### Future Matches

- Unplayed matches saved as skeletons (teams + date, no lineup/events)
- Re-scrape detects skeleton (`home_score IS NULL`) and replaces with full data when match is played
- "Próximos" tab shows future matches, "Resultados" tab shows played matches
