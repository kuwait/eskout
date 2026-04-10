// src/actions/scraping/fpf-competitions/__tests__/link-players.test.ts
// Unit tests for link-players (auto-link + auto-import) and stats aggregation (minutes, goals, cards, playing up)
// Covers linking strategies, import flow, deduplication, stat computation, and playing-up detection
// RELEVANT FILES: src/actions/scraping/fpf-competitions/link-players.ts, src/actions/scraping/fpf-competitions/stats.ts

import type { FpfMatchPlayerRow } from '@/lib/types';

/* ───────────── Supabase Mock Builder ───────────── */

/** Chainable mock mimicking Supabase's query builder. Terminal methods resolve configured data. */
function mockChain(resolvedData?: unknown, resolvedError?: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const terminal = { data: resolvedData ?? null, error: resolvedError ?? null };

  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'in', 'is', 'not', 'ilike',
    'range', 'order', 'limit', 'single', 'maybeSingle',
  ];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain.select = jest.fn().mockReturnValue({ ...chain, ...terminal });
  chain.single = jest.fn().mockResolvedValue(terminal);
  chain.maybeSingle = jest.fn().mockResolvedValue(terminal);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(terminal);

  return chain;
}

/* ───────────── Module Mocks ───────────── */

const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

jest.mock('@/lib/supabase/club-context', () => ({
  getAuthContext: jest.fn().mockResolvedValue({ clubId: 'club-001', userId: 'user-001', role: 'admin', isSuperadmin: false }),
}));

const mockFetchFpfData = jest.fn();
jest.mock('@/actions/scraping/fpf', () => ({
  fetchFpfData: (...args: unknown[]) => mockFetchFpfData(...args),
}));

jest.mock('@/lib/constants', () => ({
  birthYearToAgeGroup: (year: number) => {
    if (year >= 2019) return 'Sub-7';
    if (year === 2015) return 'Sub-11';
    if (year === 2013) return 'Sub-13';
    if (year === 2012) return 'Sub-14';
    if (year === 2011) return 'Sub-15';
    if (year === 2010) return 'Sub-16';
    if (year === 1990) return null;
    return 'Sub-15';
  },
  CURRENT_SEASON: '2025/2026',
}));

import { linkMatchPlayersToEskout, importUnlinkedPlayers } from '../link-players';
import { aggregatePlayers } from '../stats-utils';

/* ───────────── Helpers ───────────── */

function setupSuperadmin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-001' } } });
}

function setupNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

/** Factory for FpfMatchPlayerRow — sensible defaults, easy overrides */
function makeMatchPlayer(overrides?: Partial<FpfMatchPlayerRow>): FpfMatchPlayerRow {
  return {
    id: 1,
    match_id: 10,
    fpf_player_id: null,
    player_name: 'Jogador Teste',
    shirt_number: 7,
    team_name: 'FC Teste',
    is_starter: true,
    is_substitute: false,
    subbed_in_minute: null,
    subbed_out_minute: null,
    minutes_played: 70,
    goals: 0,
    penalty_goals: 0,
    own_goals: 0,
    yellow_cards: 0,
    red_cards: 0,
    red_card_minute: null,
    eskout_player_id: null,
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   PART 1: linkMatchPlayersToEskout
   ═══════════════════════════════════════════════════════════════════ */

describe('linkMatchPlayersToEskout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupSuperadmin();
  });

  /* ───────────── Access Control ───────────── */

  it('rejects non-superadmin users', async () => {
    setupNoAuth();
    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Acesso negado');
  });

  /* ───────────── Empty Cases ───────────── */

  it('returns 0/0 when competition has no matches', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([]);
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(99);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(0);
    expect(res.data!.total).toBe(0);
  });

  it('returns 0/0 when all players already linked', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 1 }]);
      if (table === 'fpf_match_players') return mockChain([]);
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(0);
    expect(res.data!.total).toBe(0);
    expect(res.data!.log.length).toBeGreaterThan(0);
  });

  /* ───────────── Strategy 0: Direct fpf_player_id match ───────────── */

  it('links by fpf_player_id (string in players ↔ number in match_players)', async () => {
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([{ id: 100, fpf_player_id: 555, player_name: 'João Mendes', is_starter: true, minutes_played: 70 }]);
        return { ...c, update: updateMock };
      }
      if (table === 'players') {
        return mockChain([{ id: 42, name: 'João Mendes', fpf_player_id: '555', fpf_link: null }]);
      }
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ eskout_player_id: 42 });
  });

  /* ───────────── Strategy 1: fpf_link URL match ───────────── */

  it('links by extracting fpf_player_id from fpf_link URL', async () => {
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([{ id: 100, fpf_player_id: 777, player_name: 'Tomás Ferreira', is_starter: true, minutes_played: 70 }]);
        return { ...c, update: updateMock };
      }
      if (table === 'players') {
        return mockChain([
          { id: 55, name: 'Tomás Ferreira', fpf_player_id: null,
            fpf_link: 'https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/777' },
        ]);
      }
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ eskout_player_id: 55 });
  });

  /* ───────────── Strategy 2: Name match ───────────── */

  it('links by exact name match when club matches', async () => {
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([{ id: 100, fpf_player_id: null, player_name: 'MARTIM COSTA', team_name: 'S.C. Freamunde', is_starter: true, minutes_played: 60 }]);
        return { ...c, update: updateMock };
      }
      if (table === 'players') {
        return mockChain([{ id: 33, name: 'Martim Costa', club: 'S.C. Freamunde', fpf_player_id: null, fpf_link: null }]);
      }
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ eskout_player_id: 33 });
  });

  it('does NOT link by name when clubs differ (David Martins Águias ≠ Dragon Force)', async () => {
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        // Competition player: David Martins from Águias Eiriz
        const c = mockChain([{ id: 100, fpf_player_id: null, player_name: 'David Martins', team_name: 'C.D. Águias Eiriz', is_starter: true, minutes_played: 70 }]);
        return { ...c, update: updateMock };
      }
      if (table === 'players') {
        // DB player: David Martins from Dragon Force (different club!)
        return mockChain([{ id: 42, name: 'David Sousa Martins', club: 'Dragon Force F.C.', fpf_player_id: null, fpf_link: null }]);
      }
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    // Should NOT link because clubs don't match
    expect(res.data!.linked).toBe(0);
    expect(res.data!.unlinked).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  /* ───────────── Deduplication ───────────── */

  it('deduplicates same player across multiple matches — links all rows at once', async () => {
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }, { id: 11 }, { id: 12 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([
          { id: 100, fpf_player_id: 555, player_name: 'João Mendes', is_starter: true, minutes_played: 70 },
          { id: 101, fpf_player_id: 555, player_name: 'João Mendes', is_starter: true, minutes_played: 70 },
          { id: 102, fpf_player_id: 555, player_name: 'João Mendes', is_starter: true, minutes_played: 70 },
        ]);
        return { ...c, update: updateMock };
      }
      if (table === 'players') {
        return mockChain([{ id: 42, name: 'João Mendes', fpf_player_id: '555', fpf_link: null }]);
      }
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(3);
    // total = unique players (1), not rows (3)
    expect(res.data!.total).toBe(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  /* ───────────── No Match ───────────── */

  it('does not link players with no match in eskout', async () => {
    const updateMock = jest.fn();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([{ id: 100, fpf_player_id: 999, player_name: 'Desconhecido', is_starter: true, minutes_played: 45 }]);
        return { ...c, update: updateMock };
      }
      if (table === 'players') return mockChain([]);
      return mockChain([]);
    });

    const res = await linkMatchPlayersToEskout(1);
    expect(res.success).toBe(true);
    expect(res.data!.linked).toBe(0);
    expect(res.data!.total).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   PART 2: importUnlinkedPlayers
   ═══════════════════════════════════════════════════════════════════ */

describe('importUnlinkedPlayers', () => {
  // Mock setTimeout to be instant — withRetry uses real delays
  const origSetTimeout = global.setTimeout;
  beforeAll(() => {
    global.setTimeout = ((fn: () => void) => { fn(); return 0; }) as unknown as typeof setTimeout;
  });
  afterAll(() => {
    global.setTimeout = origSetTimeout;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setupSuperadmin();
  });

  /* ───────────── Access Control ───────────── */

  it('rejects non-superadmin users', async () => {
    setupNoAuth();
    const res = await importUnlinkedPlayers(1);
    expect(res.success).toBe(false);
  });

  /* ───────────── Empty Cases ───────────── */

  it('returns zeros when no unlinked players', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') return mockChain([]);
      return mockChain([]);
    });

    const res = await importUnlinkedPlayers(1);
    expect(res.success).toBe(true);
    expect(res.data!.imported).toBe(0);
    expect(res.data!.skipped).toBe(0);
    expect(res.data!.errors).toBe(0);
    expect(res.data!.log.length).toBeGreaterThan(0);
  });

  /* ───────────── Successful Import ───────────── */

  it('creates player from FPF profile with correct fields', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 200 }, error: null }),
      }),
    });
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([
          { id: 100, fpf_player_id: 12345, player_name: 'Afonso Costa', team_name: 'SC Beira Mar', is_starter: true, minutes_played: 70 },
        ]);
        return { ...c, update: updateMock };
      }
      if (table === 'age_groups') return mockChain({ id: 5 });
      if (table === 'players') return { insert: insertMock };
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue({
      currentClub: 'SC Beira Mar', fullName: 'Afonso Miguel Costa',
      dob: '2011-05-20', photoUrl: 'https://fpf.pt/photo.jpg',
      clubLogoUrl: 'https://fpf.pt/logo.jpg', nationality: 'Portugal', birthCountry: 'Portugal',
    });

    const res = await importUnlinkedPlayers(1);
    expect(res.success).toBe(true);
    expect(res.data!.imported).toBe(1);
    expect(res.data!.results[0]).toEqual({ name: 'Afonso Miguel Costa', action: 'created' });

    // Verify insert data
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Afonso Miguel Costa',
      dob: '2011-05-20',
      fpf_link: 'https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/12345',
      fpf_player_id: '12345',
      nationality: 'Portugal',
      department_opinion: [],
      admin_reviewed: true,
    }));

    // Verify back-link to match_players
    expect(updateMock).toHaveBeenCalledWith({ eskout_player_id: 200 });
  });

  /* ───────────── Skips ───────────── */

  it('skips player without DOB in FPF profile', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        return mockChain([
          { id: 100, fpf_player_id: 12345, player_name: 'Sem Data', team_name: 'FC X', is_starter: true, minutes_played: 70 },
        ]);
      }
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue({
      currentClub: 'FC X', fullName: 'Sem Data', dob: null,
      photoUrl: null, clubLogoUrl: null, nationality: null, birthCountry: null,
    });

    const res = await importUnlinkedPlayers(1);
    expect(res.data!.skipped).toBe(1);
    expect(res.data!.results[0].reason).toBe('Sem data de nascimento no FPF');
  });

  it('skips player with birth year outside valid escalão range', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        return mockChain([
          { id: 100, fpf_player_id: 12345, player_name: 'Velho', team_name: 'FC X', is_starter: true, minutes_played: 70 },
        ]);
      }
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue({
      currentClub: 'FC X', fullName: 'Velho', dob: '1990-01-01',
      photoUrl: null, clubLogoUrl: null, nationality: null, birthCountry: null,
    });

    const res = await importUnlinkedPlayers(1);
    expect(res.data!.skipped).toBe(1);
    expect(res.data!.results[0].reason).toContain('1990');
  });

  /* ───────────── Errors ───────────── */

  it('errors when FPF profile not found (after retries)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        return mockChain([
          { id: 100, fpf_player_id: 99999, player_name: 'Fantasma', team_name: 'FC X', is_starter: true, minutes_played: 70 },
        ]);
      }
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue(null);

    const res = await importUnlinkedPlayers(1);
    expect(res.data!.errors).toBe(1);
    expect(res.data!.results[0].reason).toBe('Perfil FPF não encontrado');
    // withRetry: 1 initial + 3 retries = 4 calls
    expect(mockFetchFpfData).toHaveBeenCalledTimes(4);
  });

  /* ───────────── Deduplication ───────────── */

  it('deduplicates same fpf_player_id — one FPF fetch, one insert, links all rows', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 200 }, error: null }),
      }),
    });
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }, { id: 11 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([
          { id: 100, fpf_player_id: 555, player_name: 'Dup', team_name: 'FC A', is_starter: true, minutes_played: 70 },
          { id: 101, fpf_player_id: 555, player_name: 'Dup', team_name: 'FC A', is_starter: true, minutes_played: 70 },
        ]);
        return { ...c, update: updateMock };
      }
      if (table === 'age_groups') return mockChain({ id: 5 });
      if (table === 'players') return { insert: insertMock };
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue({
      currentClub: 'FC A', fullName: 'Duplicado', dob: '2011-06-15',
      photoUrl: null, clubLogoUrl: null, nationality: 'Portugal', birthCountry: 'Portugal',
    });

    const res = await importUnlinkedPlayers(1);
    expect(res.data!.imported).toBe(1);
    expect(mockFetchFpfData).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  /* ───────────── Full Name from FPF ───────────── */

  it('prefers full name from FPF over match sheet abbreviation', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 200 }, error: null }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([
          { id: 100, fpf_player_id: 111, player_name: 'A. Costa', team_name: 'FC X', is_starter: true, minutes_played: 70 },
        ]);
        return { ...c, update: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ error: null }) }) };
      }
      if (table === 'age_groups') return mockChain({ id: 5 });
      if (table === 'players') return { insert: insertMock };
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue({
      currentClub: 'FC X', fullName: 'Afonso Miguel Costa Pereira', dob: '2012-03-10',
      photoUrl: null, clubLogoUrl: null, nationality: null, birthCountry: null,
    });

    const res = await importUnlinkedPlayers(1);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Afonso Miguel Costa Pereira',
    }));
    expect(res.data!.results[0].name).toBe('Afonso Miguel Costa Pereira');
  });

  /* ───────────── FPF URL Format ───────────── */

  it('builds correct FPF profile URL from fpf_player_id', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        return mockChain([
          { id: 100, fpf_player_id: 1853103, player_name: 'Teste', team_name: 'FC', is_starter: true, minutes_played: 70 },
        ]);
      }
      return mockChain([]);
    });

    mockFetchFpfData.mockResolvedValue(null);

    await importUnlinkedPlayers(1);
    expect(mockFetchFpfData).toHaveBeenCalledWith(
      'https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/1853103',
    );
  });

  /* ───────────── Mixed Results ───────────── */

  it('handles mix of created, skipped, and errored players', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 200 }, error: null }),
      }),
    });
    const updateMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChain({ is_superadmin: true });
      if (table === 'fpf_matches') return mockChain([{ id: 10 }]);
      if (table === 'fpf_match_players') {
        const c = mockChain([
          { id: 100, fpf_player_id: 111, player_name: 'OK', team_name: 'FC', is_starter: true, minutes_played: 70 },
          { id: 101, fpf_player_id: 222, player_name: 'Sem DOB', team_name: 'FC', is_starter: true, minutes_played: 70 },
          { id: 102, fpf_player_id: 333, player_name: 'Morto', team_name: 'FC', is_starter: true, minutes_played: 70 },
        ]);
        return { ...c, update: updateMock };
      }
      if (table === 'age_groups') return mockChain({ id: 5 });
      if (table === 'players') return { insert: insertMock };
      return mockChain([]);
    });

    let call = 0;
    mockFetchFpfData.mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve({
        currentClub: 'FC', fullName: 'OK', dob: '2011-01-01',
        photoUrl: null, clubLogoUrl: null, nationality: 'Portugal', birthCountry: 'Portugal',
      });
      if (call === 2) return Promise.resolve({
        currentClub: 'FC', fullName: 'Sem DOB', dob: null,
        photoUrl: null, clubLogoUrl: null, nationality: null, birthCountry: null,
      });
      return Promise.resolve(null);
    });

    const res = await importUnlinkedPlayers(1);
    expect(res.data!.imported).toBe(1);
    expect(res.data!.skipped).toBe(1);
    expect(res.data!.errors).toBe(1);
    expect(res.data!.results).toHaveLength(3);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   PART 3: aggregatePlayers — Stats (minutes, goals, cards)
   ═══════════════════════════════════════════════════════════════════ */

describe('aggregatePlayers', () => {

  /* ───────────── Minutes ───────────── */

  it('sums total minutes across matches for same player', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'João', minutes_played: 70 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'João', minutes_played: 45, match_id: 11 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'João', minutes_played: 80, match_id: 12 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalMinutes).toBe(195);
  });

  it('counts starters vs substitutes correctly', () => {
    const rows = [
      // 2 starts, 1 sub entry
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'A', is_starter: true, minutes_played: 70 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'A', is_starter: true, minutes_played: 60, match_id: 11 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'A', is_starter: false, minutes_played: 25, match_id: 12 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats[0].gamesStarted).toBe(2);
    expect(stats[0].gamesAsSub).toBe(1);
    expect(stats[0].totalGames).toBe(3);
  });

  it('does not count substitute with 0 minutes as a game played', () => {
    const rows = [
      // Unused sub — on the bench but never entered
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Suplente', is_starter: false, minutes_played: 0 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats[0].gamesAsSub).toBe(0);
    expect(stats[0].totalGames).toBe(0);
  });

  it('handles null minutes_played as 0', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Nulo', minutes_played: null, is_starter: true }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats[0].totalMinutes).toBe(0);
    // Starter still counts as a game even with null minutes
    expect(stats[0].gamesStarted).toBe(1);
    expect(stats[0].totalGames).toBe(1);
  });

  /* ───────────── Goals ───────────── */

  it('sums goals, penalty goals, and own goals separately', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Goleador', goals: 2, penalty_goals: 1, own_goals: 0 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Goleador', goals: 1, penalty_goals: 0, own_goals: 1, match_id: 11 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats[0].goals).toBe(3);
    expect(stats[0].penaltyGoals).toBe(1);
    expect(stats[0].ownGoals).toBe(1);
  });

  it('counts goals from different players independently', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'A', goals: 3 }),
      makeMatchPlayer({ fpf_player_id: 2, player_name: 'B', goals: 1 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats).toHaveLength(2);
    const playerA = stats.find(s => s.playerName === 'A')!;
    const playerB = stats.find(s => s.playerName === 'B')!;
    expect(playerA.goals).toBe(3);
    expect(playerB.goals).toBe(1);
  });

  /* ───────────── Cards ───────────── */

  it('sums yellow and red cards across matches', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Duro', yellow_cards: 1, red_cards: 0 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Duro', yellow_cards: 1, red_cards: 0, match_id: 11 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Duro', yellow_cards: 0, red_cards: 1, match_id: 12 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats[0].yellowCards).toBe(2);
    expect(stats[0].redCards).toBe(1);
  });

  /* ───────────── Deduplication by fpf_player_id vs name ───────────── */

  it('groups by fpf_player_id when available (even if name differs slightly)', () => {
    const rows = [
      // Same player ID, name differs (FPF inconsistency)
      makeMatchPlayer({ fpf_player_id: 100, player_name: 'João P. Silva', goals: 1 }),
      makeMatchPlayer({ fpf_player_id: 100, player_name: 'João Pedro Silva', goals: 2, match_id: 11 }),
    ];
    const stats = aggregatePlayers(rows);
    // Should merge into 1 player
    expect(stats).toHaveLength(1);
    expect(stats[0].goals).toBe(3);
  });

  it('groups by name+team when fpf_player_id is null', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: null, player_name: 'Rui Costa', team_name: 'FC A', goals: 1 }),
      makeMatchPlayer({ fpf_player_id: null, player_name: 'Rui Costa', team_name: 'FC A', goals: 1, match_id: 11 }),
      // Same name but different team = different player
      makeMatchPlayer({ fpf_player_id: null, player_name: 'Rui Costa', team_name: 'FC B', goals: 5 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats).toHaveLength(2);
    const fcA = stats.find(s => s.teamName === 'FC A')!;
    const fcB = stats.find(s => s.teamName === 'FC B')!;
    expect(fcA.goals).toBe(2);
    expect(fcB.goals).toBe(5);
  });

  /* ───────────── Eskout Link Preservation ───────────── */

  it('preserves eskout_player_id if found in any row', () => {
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Linked', eskout_player_id: null }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Linked', eskout_player_id: 42, match_id: 11 }),
    ];
    const stats = aggregatePlayers(rows);
    expect(stats[0].eskoutPlayerId).toBe(42);
  });

  /* ───────────── Empty Input ───────────── */

  it('returns empty array for empty input', () => {
    expect(aggregatePlayers([])).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   PART 4: Playing Up Detection Logic
   ═══════════════════════════════════════════════════════════════════ */

describe('Playing Up detection', () => {
  /* These test the core logic: a player is "playing up" if their birth year
   * is AFTER (greater than) the competition's expected_birth_year_end.
   * E.g. Sub-15 competition expects 2010-2011, player born 2012 → 1 year above.
   * The actual getPlayingUpPlayers is server-action-heavy, so we test the logic directly. */

  function detectPlayingUp(
    birthYear: number,
    expectedBirthYearEnd: number,
  ): { isPlayingUp: boolean; yearsAbove: number } {
    const isPlayingUp = birthYear > expectedBirthYearEnd;
    const yearsAbove = isPlayingUp ? birthYear - expectedBirthYearEnd : 0;
    return { isPlayingUp, yearsAbove };
  }

  it('detects Sub-13 player in Sub-15 competition as playing up', () => {
    // Sub-15 expects 2010-2011, player born 2012 (Sub-13) → 1 year above
    const result = detectPlayingUp(2012, 2011);
    expect(result.isPlayingUp).toBe(true);
    expect(result.yearsAbove).toBe(1);
  });

  it('detects Sub-11 player in Sub-15 competition as playing 4 years up', () => {
    // Sub-15 expects 2010-2011, player born 2015 (Sub-11) → 4 years above
    const result = detectPlayingUp(2015, 2011);
    expect(result.isPlayingUp).toBe(true);
    expect(result.yearsAbove).toBe(4);
  });

  it('does NOT flag player in their natural age group', () => {
    // Sub-15 expects 2010-2011, player born 2011 → exactly expected
    const result = detectPlayingUp(2011, 2011);
    expect(result.isPlayingUp).toBe(false);
    expect(result.yearsAbove).toBe(0);
  });

  it('does NOT flag player older than expected (playing down is normal)', () => {
    // Sub-15 expects 2010-2011, player born 2010 → older = fine
    const result = detectPlayingUp(2010, 2011);
    expect(result.isPlayingUp).toBe(false);
  });

  it('correctly identifies playing-up stats with aggregation', () => {
    // Simulate a playing-up player with significant minutes in Sub-15
    const rows = [
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Miúdo Talentoso', minutes_played: 70, goals: 2, is_starter: true }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Miúdo Talentoso', minutes_played: 60, goals: 1, is_starter: true, match_id: 11 }),
      makeMatchPlayer({ fpf_player_id: 1, player_name: 'Miúdo Talentoso', minutes_played: 25, goals: 0, is_starter: false, match_id: 12 }),
    ];
    const stats = aggregatePlayers(rows);
    const player = stats[0];

    // This player, born 2013, playing in Sub-15 (expected 2010-2011)
    const { isPlayingUp, yearsAbove } = detectPlayingUp(2013, 2011);

    expect(isPlayingUp).toBe(true);
    expect(yearsAbove).toBe(2);
    // Should have meaningful stats showing they actually play
    expect(player.totalMinutes).toBe(155);
    expect(player.totalGames).toBe(3);
    expect(player.gamesStarted).toBe(2);
    expect(player.gamesAsSub).toBe(1);
    expect(player.goals).toBe(3);
  });

  it('identifies edge case: playing 1 year up (most common)', () => {
    // Sub-15 expects 2010-2011, player born 2012 → Sub-13 playing in Sub-15
    const result = detectPlayingUp(2012, 2011);
    expect(result.isPlayingUp).toBe(true);
    expect(result.yearsAbove).toBe(1);
  });
});
