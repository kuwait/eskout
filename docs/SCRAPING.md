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
- **Date formats:** `dd/MM/yyyy`, `yyyy-MM-dd`, Portuguese text (e.g. "27 de março de 2012")
- **Birth country fallback:** If no explicit birth country field, uses Nationality as fallback

### ZeroZero Parsing
- **Encoding:** ISO-8859-1 for player pages (decoded manually via `TextDecoder`), UTF-8 for autocomplete
- **JSON-LD:** Person schema — image, name, birthDate, nationality, height, weight, worksFor
  - `worksFor` can be string, object, array, or a string containing a JSON array — all formats handled
- **Sidebar card-data** (most reliable): Position, Foot, DOB, Nome, Clube atual, Nacionalidade, País de Nascimento, Altura, Peso
  - DOB formats: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd`, `yyyy-MM-dd (XX anos)`
- **Header:** Shirt number from `<span class="number">7.</span>`, name from `<h1 class="zz-enthdr-name">`
- **Career table:** Season, club, games, goals per row
- **Captcha detection:** Detects recaptcha redirects and empty/invalid responses

### Country Name Normalization
`normalizeCountry()` fixes common FPF accent issues (e.g. "Guine Bissau" → "Guiné-Bissau").

### Photo Dedup Logic
- FPF photo only shown if player has NO photo yet
- ZZ photo only shown if URL genuinely changed
- Club logo auto-saved silently

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

### Merge Priority
FPF for name/DOB/nationality/birthCountry, ZeroZero for position/foot/height/weight/photo/shirt number. Club: FPF priority, then ZZ.
