// src/lib/__tests__/performance-guards.test.ts
// Guards against performance regressions — fetch-all patterns, badge cascades, heartbeat intervals
// Prevents reintroduction of patterns that caused excessive Vercel CPU usage
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/hooks/useRealtimeBadges.ts, src/components/layout/AppShellClient.tsx

import { execSync } from 'child_process';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../..');

/* ───────────── Fetch-all Guards ───────────── */

describe('No fetch-all patterns in src/', () => {
  /**
   * Search for .range(0, N) where N >= 999 in src/ files.
   * These patterns bypass Supabase pagination and pull thousands of rows at once,
   * causing excessive CPU usage on Vercel serverless functions.
   *
   * Allowed exceptions:
   * - scripts/ (local-only, don't run on Vercel)
   * - Test files
   * - Comments
   */
  it('should not have .range(0, N>=999) patterns fetching all rows', () => {
    // Use grep to find .range(0, <large number>) in src/ — excluding test files
    const result = execSync(
      `grep -rn "\\.range(0," "${SRC_DIR}/src/" --include="*.ts" --include="*.tsx" || true`,
      { encoding: 'utf-8' }
    );

    const violations = result
      .split('\n')
      .filter(Boolean)
      // Exclude test files
      .filter((line) => !line.includes('__tests__'))
      // Exclude comments
      .filter((line) => {
        const codePart = line.split(':').slice(2).join(':').trim();
        return !codePart.startsWith('//') && !codePart.startsWith('*');
      })
      // Match .range(0, N) where N >= 999
      .filter((line) => {
        const match = line.match(/\.range\(0,\s*(\d+)/);
        return match && parseInt(match[1], 10) >= 999;
      });

    if (violations.length > 0) {
      fail(
        `Found ${violations.length} fetch-all pattern(s) in src/:\n\n` +
        violations.map((v) => `  ${v}`).join('\n') +
        '\n\nUse paginated fetching (.range(offset, offset + PAGE_SIZE - 1) in a loop) or ' +
        'server-side pagination with a reasonable page size (e.g. 50-100).'
      );
    }
  });

  it('should use the distinct_player_options RPC instead of fetching all rows for dropdown options', () => {
    // Guard: PlayersView should not fetch all clubs/nationalities/DOBs individually
    const result = execSync(
      `grep -n "select('club')" "${SRC_DIR}/src/components/players/PlayersView.tsx" || true`,
      { encoding: 'utf-8' }
    ).trim();

    expect(result).toBe('');
  });
});

/* ───────────── Badge Refetch Guards ───────────── */

describe('Badge refetch is selective', () => {
  it('TABLE_TO_BADGES maps each table to specific badge keys, not all', () => {
    // Import the mapping — we re-read the file to verify the pattern
    const fileContent = execSync(
      `cat "${SRC_DIR}/src/hooks/useRealtimeBadges.ts"`,
      { encoding: 'utf-8' }
    );

    // Verify TABLE_TO_BADGES exists and maps to specific keys
    expect(fileContent).toContain('TABLE_TO_BADGES');

    // Verify it does NOT do a full refetchCounts() on any table event
    // (the old pattern was: if BADGE_TABLES.has(table) → refetchCounts() for ALL)
    expect(fileContent).not.toMatch(/refetchCounts\(\)/);
  });

  it('each table maps to at most 2 badge keys', () => {
    // Re-parse TABLE_TO_BADGES from the source to validate structure
    const fileContent = execSync(
      `cat "${SRC_DIR}/src/hooks/useRealtimeBadges.ts"`,
      { encoding: 'utf-8' }
    );

    // Extract the mapping entries (e.g., "observation_notes: ['urgente', 'importante']")
    const mappingBlock = fileContent.match(/TABLE_TO_BADGES[^{]*\{([^}]+)\}/m);
    expect(mappingBlock).not.toBeNull();

    // Each line should have at most 2 keys in the array
    const entries = mappingBlock![1].split('\n').filter((l) => l.includes('['));
    for (const entry of entries) {
      const keys = entry.match(/'/g);
      // Each key uses 2 quotes, so max 4 quotes = 2 keys
      expect((keys?.length ?? 0) / 2).toBeLessThanOrEqual(2);
    }
  });
});

/* ───────────── Heartbeat Guard ───────────── */

describe('Heartbeat interval', () => {
  it('should be at least 120 seconds (2 minutes)', () => {
    const fileContent = execSync(
      `cat "${SRC_DIR}/src/components/layout/AppShellClient.tsx"`,
      { encoding: 'utf-8' }
    );

    // Find the setInterval for updateLastSeen
    const intervalMatch = fileContent.match(/setInterval\([^)]*updateLastSeen[^)]*\),\s*(\d[\d_]*)\)/m)
      || fileContent.match(/(\d[\d_]*).*\n.*return.*clearInterval/);

    // Also try: the number right before the clearInterval return
    const numberMatch = fileContent.match(/},\s*(\d[\d_]*)\);\s*\n\s*return.*clearInterval/);
    const match = intervalMatch || numberMatch;

    expect(match).not.toBeNull();
    const interval = parseInt(match![1].replace(/_/g, ''), 10);
    expect(interval).toBeGreaterThanOrEqual(120_000);
  });
});

/* ───────────── Online Threshold Guard ───────────── */

describe('Online presence threshold', () => {
  it('should be at least 5 minutes to match heartbeat interval', () => {
    // Check both page.tsx and OnlinePageClient.tsx
    for (const file of ['page.tsx', 'OnlinePageClient.tsx']) {
      const filePath = `${SRC_DIR}/src/app/master/online/${file}`;
      const content = execSync(`cat "${filePath}"`, { encoding: 'utf-8' });

      // Match pattern: new Date(now.getTime() - N * 60 * 1000)
      const thresholdMatch = content.match(/getTime\(\)\s*-\s*(\d+)\s*\*\s*60\s*\*\s*1000/);
      expect(thresholdMatch).not.toBeNull();

      const minutes = parseInt(thresholdMatch![1], 10);
      expect(minutes).toBeGreaterThanOrEqual(5);
    }
  });
});

/* ───────────── AppShell Counts Guard ───────────── */

describe('AppShell uses consolidated RPC for counts', () => {
  const appShellPath = `${SRC_DIR}/src/components/layout/AppShell.tsx`;
  let content: string;

  beforeAll(() => {
    content = execSync(`cat "${appShellPath}"`, { encoding: 'utf-8' });
  });

  it('should use get_appshell_counts RPC instead of individual count queries', () => {
    expect(content).toContain('get_appshell_counts');
  });

  it('should NOT have individual urgente/importante count queries', () => {
    // The old pattern: .eq('priority', 'urgente') with count/head
    // These should be inside the RPC now, not as individual Supabase queries
    const urgentCountQuery = content.match(/\.eq\('priority',\s*'urgente'\)/g);
    expect(urgentCountQuery).toBeNull();

    const importanteCountQuery = content.match(/\.eq\('priority',\s*'importante'\)/g);
    expect(importanteCountQuery).toBeNull();
  });

  it('should NOT have individual pending reports count query', () => {
    const pendingQuery = content.match(/\.eq\('status',\s*'pendente'\)/g);
    expect(pendingQuery).toBeNull();
  });

  it('should NOT have the observation count N+1 pattern (query per list)', () => {
    // The old pattern: .in('list_id', listIds) for counting items
    expect(content).not.toContain("in('list_id'");
  });

  it('should have at most 6 queries in the main Promise.all', () => {
    // Count Supabase .from() calls inside the Promise.all block
    // Before: 10 queries. After: 5 (profile, membership, club, age_groups, sidebar_lists)
    const promiseAllBlock = content.match(/Promise\.all\(\[[\s\S]*?\]\)/);
    expect(promiseAllBlock).not.toBeNull();
    const fromCalls = promiseAllBlock![0].match(/\.from\(/g);
    expect(fromCalls!.length).toBeLessThanOrEqual(6);
  });
});

/* ───────────── Squad Picker Dialog Guards ───────────── */

describe('AddToSquadDialog', () => {
  const dialogPath = `${SRC_DIR}/src/components/squad/AddToSquadDialog.tsx`;
  let content: string;

  beforeAll(() => {
    content = execSync(`cat "${dialogPath}"`, { encoding: 'utf-8' });
  });

  it('should NOT pre-fill position filter when dialog opens', () => {
    // The dialog used to set position: basePos on open, causing narrow results.
    // Now it opens with EMPTY_FILTERS so users can search freely.
    // Guard: the useEffect that runs on open must NOT set position in filters.
    const openEffect = content.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(open\)[\s\S]*?\},\s*\[open/m);
    expect(openEffect).not.toBeNull();

    // The setFilters inside the open block should use EMPTY_FILTERS without overriding position
    const openBlock = openEffect![0];
    expect(openBlock).not.toMatch(/position:\s*basePos/);
    expect(openBlock).not.toMatch(/position:\s*(?!''|"")[^,\n]+/);
  });

  it('should NOT pre-fill year filter when dialog opens', () => {
    // Year was pre-filled from initialYear, causing 0 results when server returned
    // players from all years but client filtered to only the pre-filled year.
    const openEffect = content.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(open\)[\s\S]*?\},\s*\[open/m);
    expect(openEffect).not.toBeNull();

    const openBlock = openEffect![0];
    // Must not set year to initialYear — should be EMPTY_FILTERS (year: '')
    expect(openBlock).not.toMatch(/year:\s*(?:isSpecial\s*\?|initialYear)/);
  });

  it('should use search_players_unaccent RPC for accent-insensitive search', () => {
    // Guard: the server action must use the unaccent RPC, not raw ilike queries
    const actionContent = execSync(
      `cat "${SRC_DIR}/src/actions/player-lists.ts"`,
      { encoding: 'utf-8' }
    );

    // searchPickerPlayers must call the RPC
    expect(actionContent).toContain("search_players_unaccent");

    // Must NOT use the old ilike pattern for search
    const searchFnMatch = actionContent.match(/async function searchPickerPlayers[\s\S]*?^}/m);
    if (searchFnMatch) {
      expect(searchFnMatch[0]).not.toMatch(/\.ilike\s*\(\s*'name'/);
      expect(searchFnMatch[0]).not.toMatch(/\.or\s*\(\s*`name\.ilike/);
    }
  });

  it('should send empty array (not null) for p_words when no search text', () => {
    // Supabase JS client handles [] differently from null for text[] params.
    // null caused the RPC to return 0 rows; [] works correctly.
    const actionContent = execSync(
      `cat "${SRC_DIR}/src/actions/player-lists.ts"`,
      { encoding: 'utf-8' }
    );

    // Must use [] as fallback, not null
    expect(actionContent).toMatch(/p_words:\s*words\.length\s*>\s*0\s*\?\s*words\s*:\s*\[\]/);
  });
});
