# Eskout — Test Strategy

> Comprehensive testing plan for the Eskout scouting platform.
> Created 2026-03-09. Review and approve before implementation.

---

## 1. Current State

| Metric | Value |
|---|---|
| Source files | ~130 in `src/` |
| Test files | **0** |
| Jest config | **None** |
| Test dependencies | **None installed** |
| CI pipeline | **None** |
| E2E framework | **None** |

The CLAUDE.md describes a Jest setup (jest.config.ts, @testing-library, etc.) but **none of it exists**. We start from zero.

---

## 2. Test Pyramid

```
        ╱╲
       ╱  ╲        E2E (Playwright)         ~15 tests
      ╱────╲       Real browser, real Supabase
     ╱      ╲
    ╱────────╲     Integration (Jest)        ~35 tests
   ╱          ╲    Server actions with mocked Supabase
  ╱────────────╲
 ╱              ╲  Unit (Jest)              ~120 tests
╱────────────────╲ Pure functions, validators, mappers
```

| Layer | Count | Runtime | What |
|---|---|---|---|
| Unit | ~120 | ~5s | Pure functions, constants, validators, mappers, date utils, position normalization |
| Integration | ~35 | ~10s | Server actions (mocked DB), middleware (mocked request/response) |
| E2E | ~15 | ~90s | Full user flows in real browser with test Supabase project |
| **Total** | **~170** | **~2 min** | |

**Why this ratio**: 70% unit / 20% integration / 10% E2E.
- Unit tests are fast, stable, and catch the most regressions per minute of CI time.
- Integration tests validate business logic wiring (action → DB → revalidate → broadcast) without a browser.
- E2E tests validate critical user journeys that cross multiple layers.

---

## 3. Risk-Prioritized Test Plan

### Priority 1 — CRITICAL (breaks the app if wrong)

These are pure functions with complex logic that every page depends on. No mocking needed. Maximum ROI.

#### `src/lib/supabase/mappers.ts` (~25 tests)

The single most important file to test. Every player displayed on every page passes through `mapPlayerRow()`. A bug here corrupts the entire UI.

| Function | Tests | What to assert |
|---|---|---|
| `mapPlayerRow()` | 8 | Full row → Player mapping; null/empty field handling; `reportLabels`/`reportLinks` filtering; `departmentOpinion` array; default values for optional fields |
| `castToOpinionArray()` | 6 | `null` → `[]`; valid array passthrough; JSON-encoded string `'["1ª Escolha"]'` → parsed; nested JSON in array items; single plain string → `[string]`; Postgres `{val1,val2}` format |
| `mapRecruitmentStatus()` | 4 | `null` → `null`; legacy English `'pool'` → `null`; legacy `'shortlist'` → `'por_tratar'`; modern Portuguese values passthrough |
| `formatShirtNumber()` | 3 | `"4.0"` → `"4"`; `"12A"` → `"12A"`; `null` → `""` |
| `isValidImageUrl()` | 4 | `null` → `false`; relative path → `false`; placeholder URL → `false`; valid https URL → `true` |
| `mapScoutingReportRow()` | 2 | Full mapping; null field defaults |
| `mapCalendarEventRow()` | 2 | Full mapping with nested player join; null player |

#### `src/lib/constants.ts` (~20 tests)

Business logic that determines age group assignment, observation tiers, and ratings.

| Function | Tests | What to assert |
|---|---|---|
| `birthYearToAgeGroup()` | 8 | 2012 → Sub-14 (current season); boundary years (Sub-7, Sub-19); very old year → Sénior; future year → `null`; year exactly at Sénior cutoff; season boundary (test with mocked date in July vs June) |
| `getAgeGroups()` | 3 | Returns 14 groups (Sénior + Sub-7..Sub-19); correct generation years; ordered descending |
| `getObservationTier()` | 4 | Player with report links → `'observado'`; player with referredBy → `'referenciado'`; empty player → `'adicionado'`; player with empty string report links → `'adicionado'` |
| `getPrimaryRating()` | 4 | Player with `reportAvgRating` → `{ value, isAverage: true }`; player with `observerEval: '4 - Muito Bom'` → `{ value: 4, isAverage: false }`; both present → report wins; neither → `null` |
| `getPositionLabel()` | 3 | Known code `'DC'` → `'Defesa Central'`; squad slot `'DC_E'` → `'Central (E)'`; `null` → `''` |
| `CURRENT_SEASON` | 1 | Format matches `'YYYY/YYYY+1'` |
| `getNationalityFlag()` | 2 | `'Portugal'` → `'🇵🇹'`; unknown → `'🌍'`; `null` → `''` |

#### `src/lib/utils/positions.ts` (~15 tests)

Position normalization runs on every player import and form submission.

| Function | Tests | What to assert |
|---|---|---|
| `normalizePosition()` | 15 | Direct matches: `'GR'`, `'guarda-redes'`, `'goalkeeper'`; accented: `'médio ofensivo'` → `'MOC'`; compound: `'DC/MDC'` → `'DC'`; ambiguous: `'extremo'` → `''`; `'ala'` → `''`; whitespace handling; `null`/`undefined`/`''` → `''`; case insensitivity; all 15 position codes have at least one test |

#### `src/lib/validators.ts` (~15 tests)

Zod schemas guard every form submission and server action.

| Schema | Tests | What to assert |
|---|---|---|
| `loginSchema` | 3 | Valid email+password passes; invalid email fails; short password fails |
| `playerFormSchema` | 5 | Minimal valid (name+dob+club); all optional defaults populated; `departmentOpinion` string preprocessing → array; invalid position code fails; URL validation for fpfLink |
| `shadowSquadSchema` | 2 | Valid playerId+position; invalid position `'XX'` fails |
| `calendarEventSchema` | 3 | Valid event passes; missing title fails; invalid eventType fails |
| `observationNoteSchema` | 2 | Valid note; empty content fails |

#### `src/lib/utils.ts` (~5 tests)

| Function | Tests | What to assert |
|---|---|---|
| `fuzzyMatch()` | 5 | Single term match; multi-term (all must match); case insensitivity; no match returns false; empty query matches everything |

#### `src/lib/utils/dates.ts` (~5 tests)

| Function | Tests | What to assert |
|---|---|---|
| `getWeekRange()` | 3 | Monday start (European convention); Sunday end; mid-week date gives correct Mon-Sun |
| `shiftWeek()` | 2 | +1 week; -1 week |

### Priority 2 — HIGH (business logic in server actions)

These require mocking `@/lib/supabase/server` and `@/lib/supabase/club-context`. Pattern: mock `createClient()` to return a chainable query builder stub.

#### `src/actions/players.ts` (~12 tests)

| Function | Tests | What to assert |
|---|---|---|
| `createPlayer()` | 4 | Successful creation with auto age group; duplicate detection (same FPF ID); scout role → `pending_approval: true`; validation failure returns error |
| `updatePlayer()` | 3 | Tracked fields log status_history entries; broadcast fires; non-existent player returns error |
| `approvePlayer()` | 2 | Sets `pending_approval: false`, `admin_reviewed: true`; broadcasts |
| `rejectPlayer()` | 2 | Deletes player; broadcasts; non-existent player returns error |
| `deletePlayer()` | 1 | Deletes and broadcasts |

#### `src/actions/pipeline.ts` (~8 tests)

| Function | Tests | What to assert |
|---|---|---|
| `updateRecruitmentStatus()` | 4 | Status change logged in history; `vir_treinar` → creates calendar event; `confirmado` → clears training date; broadcast fires |
| `updateTrainingDate()` | 2 | Sets date; clears date (null) |
| `reorderPipelineCards()` | 2 | Updates pipeline_order for each card; broadcasts BULK |

#### `src/actions/squads.ts` (~6 tests)

| Function | Tests | What to assert |
|---|---|---|
| `addToShadowSquad()` | 2 | Sets `is_shadow_squad`, `shadow_position`; logs status history |
| `removeFromShadowSquad()` | 1 | Clears flags; logs history |
| `toggleRealSquad()` | 2 | Add to real squad; remove from real squad |
| `moveSquadPlayerPosition()` | 1 | Updates position without removing from squad |

#### `src/actions/scout-reports.ts` (~5 tests)

| Function | Tests | What to assert |
|---|---|---|
| `approveScoutReport()` | 2 | Creates player from report data; links report to new player; duplicate detection |
| `submitScoutReport()` | 2 | Validates fields; saves with correct `created_by` |
| `getMultiScoutConsensus()` | 1 | Agreement scoring calculation (multiple scouts, same player) |

#### `src/actions/calendar.ts` (~4 tests)

| Function | Tests | What to assert |
|---|---|---|
| `createCalendarEvent()` | 2 | Saves event; pipeline sync (treino → sets recruitment status) |
| `deleteCalendarEvent()` | 2 | Deletes event; reverse pipeline sync (clears training date) |

### Priority 3 — MEDIUM (middleware, hooks, components)

#### `src/middleware.ts` (~8 tests)

Mock `NextRequest` and verify redirect behavior.

| Scenario | Tests | What to assert |
|---|---|---|
| Public routes | 2 | `/login` accessible without auth; authenticated user on `/login` → redirect to `/` |
| Admin routes | 2 | Admin can access `/admin/*`; scout redirected away from `/admin/*` |
| Scout routes | 2 | Scout can access `/submeter`, `/meus-relatorios`; scout blocked from `/pipeline` |
| Club context | 2 | No club cookie → redirect to `/escolher-clube`; single-club user → auto-select |

#### `src/hooks/useRealtimeTable.ts` (~4 tests, jsdom)

| Scenario | Tests | What to assert |
|---|---|---|
| Subscription | 2 | Subscribes to event bus on mount; unsubscribes on unmount |
| Debounce | 2 | Multiple rapid events → single callback; respects custom debounceMs |

#### `src/lib/realtime/broadcast.ts` (~3 tests)

| Scenario | Tests | What to assert |
|---|---|---|
| Success | 1 | subscribe → send → removeChannel flow |
| Timeout | 1 | 5s timeout → logs error, does not throw |
| Failure | 1 | Channel error → logs error, does not throw |

### Priority 4 — LOW (UI components, export, scraping)

These are lower priority because they're harder to test and less likely to regress silently.

| File | Tests | What to assert |
|---|---|---|
| `src/lib/utils/exportSquad.ts` | 3 | `exportAsText()` output format; `exportAsWhatsApp()` emoji markers; empty squad handling |
| `src/components/common/StatusBadge.tsx` | 2 | Renders correct color/label for each status (jsdom) |
| `src/components/common/OpinionBadge.tsx` | 2 | Renders correct color/label for each opinion (jsdom) |
| `src/actions/scraping.ts` | 0 | **Skip** — external HTTP, fragile, tested manually. Mock-only smoke test if time allows |

---

## 4. What Scares Me Most (Untested)

Ranked by blast radius × likelihood of silent failure:

| # | What | Why it's scary | Impact if wrong |
|---|---|---|---|
| 1 | **`mapPlayerRow()` + `castToOpinionArray()`** | Every player on every page passes through this. Legacy format handling (Postgres arrays, JSON strings, null coalescing) is easy to break on schema changes | Garbled player data across the entire app |
| 2 | **`birthYearToAgeGroup()` + `getSeasonEndYear()`** | Date-dependent logic that silently produces wrong results. Breaks at season boundary (July 1). No one checks "is Sub-14 correct?" until it's too late | Players in wrong age groups, invisible to users |
| 3 | **`createPlayer()` duplicate detection** | Multiple code paths (FPF ID, ZeroZero ID, name+DOB match). If any path fails silently, duplicate players accumulate | Data pollution, confusing scouts, wrong squad counts |
| 4 | **Pipeline ↔ Calendar bidirectional sync** | Two server actions (`pipeline.ts`, `calendar.ts`) both create/delete events for each other. A bug creates infinite loops or orphaned events | Calendar shows phantom events, pipeline dates wrong |
| 5 | **Middleware route protection** | 6 route classes with complex role checking. A single `if` wrong = unauthorized access to admin features | Security breach, scouts seeing admin data |
| 6 | **`approveScoutReport()` → `createPlayer()`** | Report approval creates a real player. If the mapping or duplicate check is wrong, bad data enters the main database | Corrupted player records from scout submissions |

---

## 5. CI Pipeline (GitHub Actions)

### `ci.yml` — Runs on every push to `main` and all PRs

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit          # ~15s
      - run: npm run lint               # ~10s

  unit-and-integration:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test -- --ci --forceExit --detectOpenHandles  # ~15s

  e2e:
    runs-on: ubuntu-latest
    needs: unit-and-integration
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build              # ~60s
      - run: npx playwright test        # ~90s
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### Estimated CI times

| Job | Duration | Blocks |
|---|---|---|
| lint + typecheck | ~30s | Nothing |
| unit + integration | ~15s | lint |
| e2e | ~3min | unit |
| **Total (sequential)** | **~4min** | |
| **Total (parallel lint+unit)** | **~3.5min** | |

### Required secrets

| Secret | Purpose |
|---|---|
| `TEST_SUPABASE_URL` | Dedicated test Supabase project (NOT production) |
| `TEST_SUPABASE_ANON_KEY` | Test project anon key |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Test project service role key (for seeding/cleanup) |

### Test Supabase project

Create a separate Supabase project for CI/E2E. Run all 28 migrations on it. Seed with test fixtures before each E2E run, clean up after.

---

## 6. E2E Tests (Playwright)

### Setup

- Framework: Playwright with Chromium
- Config: `playwright.config.ts` with `webServer` pointing to `npm run start` (production build)
- Auth: Test users created via Supabase service role in `globalSetup`
- Fixtures: `admin@test.com` (admin), `scout@test.com` (scout), `recruiter@test.com` (recruiter)
- Cleanup: `globalTeardown` deletes all test data

### Test users (seeded in globalSetup)

| User | Role | Purpose |
|---|---|---|
| `admin@test.eskout.com` | admin | Full access tests |
| `scout@test.eskout.com` | scout | Limited access tests |
| `editor@test.eskout.com` | editor | Edit-but-not-delete tests |

### E2E test scenarios (~15 tests)

#### Auth & routing (3 tests)

| Test | Steps | Assertions |
|---|---|---|
| Login → dashboard | Navigate to `/login`, fill email+password, submit | Redirected to `/`, sees dashboard |
| Scout blocked routes | Login as scout, navigate to `/admin/utilizadores` | Redirected away, never sees admin content |
| Logout | Click logout in menu | Redirected to `/login`, session cleared |

#### Player CRUD (3 tests)

| Test | Steps | Assertions |
|---|---|---|
| Create player | Navigate to `/jogadores/novo`, fill name+dob+club, submit | Redirected to player profile, player visible in `/jogadores` |
| Edit player | Open player profile, edit club name, save | Profile shows updated club, status history entry appears |
| Delete player | Open player profile, click delete, confirm | Player gone from list |

#### Pipeline flow (2 tests)

| Test | Steps | Assertions |
|---|---|---|
| Change recruitment status | Open player in pipeline, change status to `'vir_treinar'` | Status badge updates, calendar event auto-created |
| Pipeline → Calendar sync | Change status to `'reuniao_marcada'`, set date | Calendar shows event on that date |

#### Squad management (2 tests)

| Test | Steps | Assertions |
|---|---|---|
| Add to shadow squad | Open squad page, search player, add to DC position | Player appears in shadow squad at DC |
| Remove from shadow squad | Click remove on squad player | Player gone from shadow squad |

#### Calendar (2 tests)

| Test | Steps | Assertions |
|---|---|---|
| Create event | Navigate to calendar, click add, fill form, save | Event appears on calendar grid |
| Delete event | Click event, delete, confirm | Event gone |

#### Scout submission (1 test)

| Test | Steps | Assertions |
|---|---|---|
| Submit → approve flow | Login as scout, go to `/submeter`, fill report, submit. Login as admin, go to `/admin/pendentes`, approve | Player created from report, visible in player list |

#### Multi-user Realtime (2 tests)

These are the most valuable E2E tests — they validate the realtime system end-to-end.

| Test | Steps | Assertions |
|---|---|---|
| **Two browsers, player edit** | Open 2 browser contexts (admin + editor). Both navigate to same squad page. Admin adds player to shadow squad. | Editor's page updates automatically (player appears) within 5 seconds, WITHOUT manual refresh |
| **Two browsers, pipeline status** | Open 2 browser contexts. Both on pipeline page. Admin changes player status. | Second context sees updated status badge within 5 seconds |

**Implementation pattern for multi-user realtime:**

```typescript
test('realtime: squad change propagates to other user', async ({ browser }) => {
  // Create two independent browser contexts with different auth
  const adminContext = await browser.newContext({ storageState: 'admin-auth.json' });
  const editorContext = await browser.newContext({ storageState: 'editor-auth.json' });

  const adminPage = await adminContext.newPage();
  const editorPage = await editorContext.newPage();

  // Both navigate to shadow squad
  await adminPage.goto('/campo/sombra');
  await editorPage.goto('/campo/sombra');

  // Admin adds a player to shadow squad
  await adminPage.click('[data-testid="add-to-squad"]');
  await adminPage.fill('[data-testid="player-search"]', 'Teste Jogador');
  await adminPage.click('[data-testid="search-result-0"]');
  await adminPage.click('[data-testid="confirm-add"]');

  // Editor should see the player appear (via Realtime) within 5s
  await expect(
    editorPage.locator('text=Teste Jogador')
  ).toBeVisible({ timeout: 5000 });

  await adminContext.close();
  await editorContext.close();
});
```

---

## 7. Infrastructure to Install

### Dependencies

```bash
# Unit + integration testing
npm install -D jest @jest/types ts-jest @types/jest
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install -D jest-environment-jsdom

# E2E testing
npm install -D @playwright/test
```

### Config files to create

| File | Purpose |
|---|---|
| `jest.config.ts` | Jest config with `next/jest`, path aliases, `clearMocks: true` |
| `playwright.config.ts` | Playwright config with webServer, chromium-only, test dir |
| `e2e/global-setup.ts` | Seed test users and data in test Supabase |
| `e2e/global-teardown.ts` | Clean up test data |
| `e2e/auth/admin-auth.json` | Saved admin auth state |
| `e2e/auth/scout-auth.json` | Saved scout auth state |

### package.json scripts to add

```json
{
  "test": "jest",
  "test:watch": "jest --watch",
  "test:ci": "jest --ci --forceExit --detectOpenHandles",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

---

## 8. Test File Layout

```
src/
├── lib/
│   ├── __tests__/
│   │   ├── constants.test.ts         # birthYearToAgeGroup, getObservationTier, getPrimaryRating
│   │   ├── validators.test.ts        # All Zod schema tests
│   │   └── utils.test.ts             # fuzzyMatch
│   ├── supabase/
│   │   └── __tests__/
│   │       └── mappers.test.ts       # mapPlayerRow, castToOpinionArray, etc.
│   ├── utils/
│   │   └── __tests__/
│   │       ├── positions.test.ts     # normalizePosition
│   │       ├── dates.test.ts         # getWeekRange, shiftWeek
│   │       └── exportSquad.test.ts   # exportAsText, exportAsWhatsApp
│   └── realtime/
│       └── __tests__/
│           └── broadcast.test.ts     # broadcastMutation (mocked channel)
├── hooks/
│   └── __tests__/
│       └── useRealtimeTable.test.ts  # Hook subscription/debounce (jsdom)
├── actions/
│   └── __tests__/
│       ├── players.test.ts           # createPlayer, approvePlayer, etc.
│       ├── pipeline.test.ts          # updateRecruitmentStatus, calendar sync
│       ├── squads.test.ts            # addToShadowSquad, toggleRealSquad
│       ├── scout-reports.test.ts     # approveScoutReport, consensus
│       └── calendar.test.ts          # createCalendarEvent, pipeline sync
├── __tests__/
│   └── middleware.test.ts            # Route protection
e2e/
├── global-setup.ts
├── global-teardown.ts
├── auth.setup.ts                     # Login + save storage state
├── auth/
│   ├── admin-auth.json
│   ├── scout-auth.json
│   └── editor-auth.json
├── login.spec.ts
├── player-crud.spec.ts
├── pipeline.spec.ts
├── squad.spec.ts
├── calendar.spec.ts
├── scout-submission.spec.ts
└── realtime.spec.ts                  # Multi-user realtime tests
```

---

## 9. Test Conventions

Following CLAUDE.md guidelines:

- Co-locate tests in `__tests__/` next to source
- Factory functions: `makePlayer()`, `makePlayerRow()`, `makeScoutingReport()`, `makeCalendarEvent()`
- Mock at module boundary: `jest.mock('@/lib/supabase/server')`, `jest.mock('@/lib/supabase/club-context')`
- Portuguese test data: use real Portuguese names, clubs (Boavista, Leixões, Salgueiros), positions
- 4-line header comments on test files
- Section dividers between test groups
- `/** @jest-environment jsdom */` docblock for component/hook tests

### Factory function pattern

```typescript
// src/lib/__tests__/factories.ts
export function makePlayer(overrides?: Partial<Player>): Player {
  return {
    id: 1,
    name: 'João Silva',
    dob: '2012-03-15',
    club: 'Boavista FC',
    positionNormalized: 'DC',
    // ... all required fields with sensible defaults
    ...overrides,
  };
}

export function makePlayerRow(overrides?: Partial<PlayerRow>): PlayerRow {
  return {
    id: 1,
    name: 'João Silva',
    dob: '2012-03-15',
    club: 'Boavista FC',
    position_normalized: 'DC',
    // ... all snake_case fields
    ...overrides,
  };
}
```

### Supabase mock pattern

```typescript
// src/actions/__tests__/__mocks__/supabase.ts
export function mockSupabaseClient() {
  const mock = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    // ... chainable
  };
  return mock;
}
```

---

## 10. Implementation Order

Phase by phase, each phase is independently shippable:

| Phase | What | Tests | Estimated effort |
|---|---|---|---|
| **A** | Install Jest + config + factory functions + `mappers.test.ts` + `constants.test.ts` + `positions.test.ts` | ~60 | 1 session |
| **B** | `validators.test.ts` + `utils.test.ts` + `dates.test.ts` + `broadcast.test.ts` | ~30 | 1 session |
| **C** | Server action tests: `players.test.ts`, `pipeline.test.ts`, `squads.test.ts` | ~25 | 1 session |
| **D** | `middleware.test.ts` + `scout-reports.test.ts` + `calendar.test.ts` | ~17 | 1 session |
| **E** | Install Playwright + E2E setup + auth + 5 core flows | ~8 | 1 session |
| **F** | Remaining E2E + multi-user realtime tests + CI pipeline | ~10 | 1 session |

**Start with Phase A** — highest ROI, no mocking complexity, catches the scariest bugs.

---

## 11. What We Explicitly Skip

| Area | Why |
|---|---|
| `src/actions/scraping.ts` | External HTTP to FPF/ZeroZero — fragile, changes without notice. Test manually. |
| `src/actions/export.ts` | ExcelJS buffer generation — test manually via download. Low regression risk. |
| `src/components/ui/*` (shadcn) | Third-party components, tested upstream. |
| Visual regression tests | Overkill for current team size. Screenshot tests add CI time without proportional value. |
| `src/lib/theme.tsx` | localStorage + DOM attrs — trivial logic, tested by E2E implicitly. |
| `src/hooks/useResizableColumns.ts` | DOM measurement + mouse events — hard to unit test, low business impact. |
| Snapshot tests | Brittle, low signal. Prefer assertion-based tests. |
