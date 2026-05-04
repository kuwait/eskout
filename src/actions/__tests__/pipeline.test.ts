// src/actions/__tests__/pipeline.test.ts
// Tests for src/actions/pipeline.ts — permission guards + critical validation paths
// Scout role must be blocked from every mutation; standby/decision_side need input validation
// RELEVANT FILES: src/actions/pipeline.ts, src/lib/__tests__/supabase-mock.ts, src/lib/validators.ts

/* ───────────── Mock state ───────────── */

interface MutationCall {
  table: string;
  payload: Record<string, unknown>;
}

const updateCalls: MutationCall[] = [];
const insertCalls: MutationCall[] = [];

let authContext: { clubId: string; userId: string; role: string; isSuperadmin: boolean } = {
  clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false,
};

let activeClubContext: {
  clubId: string; userId: string; role: string; isSuperadmin: boolean;
  club: { id: string; name: string; slug: string; logoUrl: string | null; features: Record<string, boolean>; settings: Record<string, unknown> };
} = {
  clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false,
  club: { id: 'club-001', name: 'Test Club', slug: 'test', logoUrl: null, features: {}, settings: {} },
};

/** Per-test override: what `from('table').select(...).single()` returns. */
let playerSelectResult: { data: Record<string, unknown> | null; error: { message: string } | null } = { data: null, error: null };

/* ───────────── Supabase mock ───────────── */

import { createSupabaseQueryBuilder } from '@/lib/__tests__/supabase-mock';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockImplementation(() => Promise.resolve({
    from: (table: string) => {
      const builder = createSupabaseQueryBuilder(table, {
        onUpdate: (t, p) => updateCalls.push({ table: t, payload: p }),
        onInsert: (t, p) => insertCalls.push({ table: t, payload: p }),
        // For `players` SELECT .single(), serve the per-test playerSelectResult.
        // Other tables fall through to default null/null.
        resolveFor: (t) => t === 'players' ? playerSelectResult : { data: null, error: null },
      });
      return builder;
    },
  })),
  createServiceClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/supabase/club-context', () => ({
  getAuthContext: jest.fn().mockImplementation(() => Promise.resolve(authContext)),
  getActiveClub: jest.fn().mockImplementation(() => Promise.resolve(activeClubContext)),
}));

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/realtime/broadcast', () => ({
  broadcastRowMutation: jest.fn().mockResolvedValue(undefined),
  broadcastBulkMutation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/actions/notifications', () => ({
  notifyTaskAssigned: jest.fn(),
}));

import {
  updateRecruitmentStatus,
  reorderPipelineCards,
  updateMeetingDate,
  updateSigningDate,
  updateMeetingAttendees,
  updateSigningAttendees,
  updateDecisionSide,
  updateStandbyReason,
  updateContactPurpose,
} from '../pipeline';

/* ───────────── Helpers ───────────── */

function reset() {
  updateCalls.length = 0;
  insertCalls.length = 0;
  authContext = { clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false };
  activeClubContext = {
    clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false,
    club: { id: 'club-001', name: 'Test Club', slug: 'test', logoUrl: null, features: {}, settings: {} },
  };
  playerSelectResult = { data: null, error: null };
}

beforeEach(reset);

/* ───────────── Permission guards: scout is blocked everywhere ───────────── */

describe('pipeline — scout role blocked from all mutations', () => {
  beforeEach(() => {
    authContext = { ...authContext, role: 'scout' };
    activeClubContext = { ...activeClubContext, role: 'scout' };
  });

  it('updateRecruitmentStatus rejects scout', async () => {
    const res = await updateRecruitmentStatus(1, 'em_contacto');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permissão/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('reorderPipelineCards rejects scout', async () => {
    const res = await reorderPipelineCards([{ playerId: 1, order: 0 }]);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permissão/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('updateMeetingDate rejects scout', async () => {
    const res = await updateMeetingDate(1, '2026-04-01');
    expect(res.success).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it('updateSigningDate rejects scout', async () => {
    const res = await updateSigningDate(1, '2026-04-01');
    expect(res.success).toBe(false);
  });

  it('updateMeetingAttendees rejects scout', async () => {
    const res = await updateMeetingAttendees(1, ['user-x']);
    expect(res.success).toBe(false);
  });

  it('updateSigningAttendees rejects scout', async () => {
    const res = await updateSigningAttendees(1, ['user-x']);
    expect(res.success).toBe(false);
  });

  it('updateDecisionSide rejects scout', async () => {
    const res = await updateDecisionSide(1, 'club');
    expect(res.success).toBe(false);
  });

  it('updateStandbyReason rejects scout', async () => {
    const res = await updateStandbyReason(1, 'em pausa');
    expect(res.success).toBe(false);
  });

  it('updateContactPurpose rejects scout', async () => {
    const res = await updateContactPurpose(1, 'cp-uuid', null);
    expect(res.success).toBe(false);
  });
});

/* ───────────── Validation guards ───────────── */

describe('pipeline — input validation', () => {
  it('reorderPipelineCards is a no-op when updates is empty', async () => {
    const res = await reorderPipelineCards([]);
    expect(res.success).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('updateStandbyReason rejects empty/whitespace reason', async () => {
    expect((await updateStandbyReason(1, '')).success).toBe(false);
    expect((await updateStandbyReason(1, '   ')).success).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it('updateDecisionSide rejects invalid side enum', async () => {
    // @ts-expect-error — testing runtime validation against bad input
    const res = await updateDecisionSide(1, 'invalid-side');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/inválido/i);
  });

  it('updateDecisionSide rejects when player not in a_decidir', async () => {
    playerSelectResult = {
      data: { decision_side: null, recruitment_status: 'em_contacto' },
      error: null,
    };
    const res = await updateDecisionSide(1, 'club');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/A decidir/i);
    expect(updateCalls).toHaveLength(0);
  });
});

/* ───────────── Status change side-effects ───────────── */

describe('pipeline — updateDecisionSide writes status_history when side changes', () => {
  it('inserts history entry for decision_side change', async () => {
    playerSelectResult = {
      data: { decision_side: null, recruitment_status: 'a_decidir' },
      error: null,
    };
    const res = await updateDecisionSide(1, 'player');
    expect(res.success).toBe(true);
    // status_history insert was called for decision_side change
    const historyInsert = insertCalls.find((c) => c.table === 'status_history');
    expect(historyInsert).toBeDefined();
    expect(historyInsert?.payload).toMatchObject({
      field_changed: 'decision_side',
      old_value: null,
      new_value: 'player',
      changed_by: 'admin-001',
      club_id: 'club-001',
    });
  });

  it('returns success without writing when same side already set', async () => {
    playerSelectResult = {
      data: { decision_side: 'club', recruitment_status: 'a_decidir' },
      error: null,
    };
    const res = await updateDecisionSide(1, 'club');
    expect(res.success).toBe(true);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});
