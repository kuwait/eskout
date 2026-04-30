// src/actions/__tests__/move-squad-player.test.ts
// Unit tests for moveSquadPlayerToOtherSquad — used by cross-squad drag in shadow multi-squad view
// Guards: scout permission, same-squad rejection, mismatched-type rejection, atomic move, dup detection
// RELEVANT FILES: src/actions/squads.ts, src/components/squad/MultiShadowSquadView.tsx

/* ───────────── Mock State ───────────── */

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
}
interface InsertCall {
  table: string;
  payload: Record<string, unknown>;
}

const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
let squadsResult: { data: Array<{ id: number; name: string; squad_type: string; age_group_id: number }> | null; error: { code?: string; message: string } | null } = { data: null, error: null };
let updateError: { code?: string; message: string } | null = null;
let authContext: { clubId: string; userId: string; role: string; isSuperadmin: boolean } = {
  clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false,
};

/* ───────────── Supabase Mock Builder ───────────── */

function makeQueryBuilder(table: string) {
  const builder: Record<string, jest.Mock> = {};

  builder.select = jest.fn().mockReturnValue(builder);
  builder.update = jest.fn((payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload });
    return builder;
  });
  builder.insert = jest.fn((payload: Record<string, unknown>) => {
    insertCalls.push({ table, payload });
    return Promise.resolve({ error: null });
  });
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.in = jest.fn().mockReturnValue(builder);
  // Resolution handler — depends on what table + which terminal method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (builder as any).then = (resolve: (v: unknown) => void) => {
    if (table === 'squads') {
      resolve(squadsResult);
    } else if (table === 'squad_players') {
      resolve({ error: updateError });
    } else if (table === 'players') {
      // syncLegacyFlags update
      resolve({ error: null });
    } else {
      resolve({ data: null, error: null });
    }
  };
  return builder;
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: (table: string) => makeQueryBuilder(table),
  }),
}));

jest.mock('@/lib/supabase/club-context', () => ({
  getAuthContext: jest.fn().mockImplementation(() => Promise.resolve(authContext)),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/realtime/broadcast', () => ({
  broadcastRowMutation: jest.fn().mockResolvedValue(undefined),
  broadcastBulkMutation: jest.fn().mockResolvedValue(undefined),
}));

import { moveSquadPlayerToOtherSquad } from '../squads';

/* ───────────── Helpers ───────────── */

function reset() {
  updateCalls.length = 0;
  insertCalls.length = 0;
  authContext = { clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false };
  squadsResult = {
    data: [
      { id: 1, name: 'Squad A', squad_type: 'shadow', age_group_id: 10 },
      { id: 2, name: 'Squad B', squad_type: 'shadow', age_group_id: 10 },
    ],
    error: null,
  };
  updateError = null;
}

/* ───────────── Tests ───────────── */

describe('moveSquadPlayerToOtherSquad', () => {
  beforeEach(reset);

  it('rejects when caller has scout role', async () => {
    authContext = { clubId: 'club-001', userId: 'scout-001', role: 'scout', isSuperadmin: false };
    const res = await moveSquadPlayerToOtherSquad(42, 1, 2, 'DC_E', 0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permissão/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects when fromSquadId === toSquadId', async () => {
    const res = await moveSquadPlayerToOtherSquad(42, 1, 1, 'DC_E', 0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/origem.*destino/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects when one of the squads is not found', async () => {
    squadsResult = {
      data: [{ id: 1, name: 'Squad A', squad_type: 'shadow', age_group_id: 10 }],
      error: null,
    };
    const res = await moveSquadPlayerToOtherSquad(42, 1, 2, 'DC_E', 0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/não encontrados/i);
  });

  it('rejects when squads have different types (shadow vs real)', async () => {
    squadsResult = {
      data: [
        { id: 1, name: 'Sombra A', squad_type: 'shadow', age_group_id: 10 },
        { id: 2, name: 'Plantel A', squad_type: 'real', age_group_id: 10 },
      ],
      error: null,
    };
    const res = await moveSquadPlayerToOtherSquad(42, 1, 2, 'DC_E', 0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/tipos de plantel diferentes/i);
  });

  it('updates squad_players with the new squad_id, position and sort_order', async () => {
    const res = await moveSquadPlayerToOtherSquad(42, 1, 2, 'DC_E', 3);
    expect(res.success).toBe(true);
    const sqUpdate = updateCalls.find((c) => c.table === 'squad_players');
    expect(sqUpdate).toBeDefined();
    expect(sqUpdate!.payload).toEqual({ squad_id: 2, position: 'DC_E', sort_order: 3 });
  });

  it('logs the status change with both squad names', async () => {
    await moveSquadPlayerToOtherSquad(42, 1, 2, 'EE', 0);
    const log = insertCalls.find((c) => c.table === 'status_history');
    expect(log).toBeDefined();
    expect(log!.payload.field_changed).toBe('shadow_position');
    expect(log!.payload.old_value).toBe('Squad A');
    expect(log!.payload.new_value).toBe('Squad B');
    expect(String(log!.payload.notes)).toMatch(/Squad A.*Squad B.*EE/);
  });

  it('syncs legacy flags (is_shadow_squad + shadow_position) on the players table', async () => {
    await moveSquadPlayerToOtherSquad(42, 1, 2, 'PL', 0);
    const playerUpdate = updateCalls.find((c) => c.table === 'players');
    expect(playerUpdate).toBeDefined();
    expect(playerUpdate!.payload).toMatchObject({ is_shadow_squad: true, shadow_position: 'PL' });
  });

  it('returns a friendly error when the unique constraint fires (player already in target)', async () => {
    updateError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const res = await moveSquadPlayerToOtherSquad(42, 1, 2, 'DC_E', 0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/já existe no plantel de destino/i);
  });

  it('returns a generic error for other DB failures', async () => {
    updateError = { code: '42P01', message: 'relation does not exist' };
    const res = await moveSquadPlayerToOtherSquad(42, 1, 2, 'DC_E', 0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Erro ao mover/i);
  });
});
