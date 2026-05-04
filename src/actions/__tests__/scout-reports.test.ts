// src/actions/__tests__/scout-reports.test.ts
// Tests for src/actions/scout-reports.ts — permission boundaries (scout vs admin/editor)
// + author-can-delete-own / admin-can-delete-any rule for deleteScoutingReport
// RELEVANT FILES: src/actions/scout-reports.ts, src/lib/__tests__/supabase-mock.ts

/* ───────────── Mock state ───────────── */

interface MutationCall {
  table: string;
  payload: Record<string, unknown>;
}

const updateCalls: MutationCall[] = [];
const deleteCalls: { table: string }[] = [];

let authContext: { clubId: string; userId: string; role: string; isSuperadmin: boolean } = {
  clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false,
};

/** Per-test override: what `from('scouting_reports').select(...).single()` returns. */
let reportSelectResult: { data: { id: number; author_id: string; player_id: number } | null; error: { message: string } | null } = {
  data: null,
  error: null,
};

/* ───────────── Supabase mock ───────────── */

import { createSupabaseQueryBuilder } from '@/lib/__tests__/supabase-mock';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockImplementation(() => Promise.resolve({
    from: (table: string) => createSupabaseQueryBuilder(table, {
      onUpdate: (t, p) => updateCalls.push({ table: t, payload: p }),
      onDelete: (t) => deleteCalls.push({ table: t }),
      // .single() on scouting_reports returns the per-test result
      resolveFor: (t) => t === 'scouting_reports' ? reportSelectResult : { data: null, error: null },
    }),
  })),
}));

jest.mock('@/lib/supabase/club-context', () => ({
  getAuthContext: jest.fn().mockImplementation(() => Promise.resolve(authContext)),
}));

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/realtime/broadcast', () => ({
  broadcastRowMutation: jest.fn().mockResolvedValue(undefined),
  broadcastBulkMutation: jest.fn().mockResolvedValue(undefined),
}));

import {
  listAllScoutReports,
  approveScoutReport,
  rejectScoutReport,
  deleteScoutingReport,
  toggleReportTag,
} from '../scout-reports';

/* ───────────── Helpers ───────────── */

function reset() {
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authContext = { clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false };
  reportSelectResult = { data: null, error: null };
}

beforeEach(reset);

/* ───────────── Permission boundaries: scout role ───────────── */

describe('scout-reports — scout role blocked from admin actions', () => {
  beforeEach(() => {
    authContext = { ...authContext, role: 'scout' };
  });

  it('listAllScoutReports rejects scout', async () => {
    const res = await listAllScoutReports();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permissão/i);
    expect(res.reports).toHaveLength(0);
  });

  it('approveScoutReport rejects scout', async () => {
    const res = await approveScoutReport(1);
    expect(res.success).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejectScoutReport rejects scout', async () => {
    const res = await rejectScoutReport(1);
    expect(res.success).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it('toggleReportTag rejects scout', async () => {
    const res = await toggleReportTag(1, 'highlight');
    expect(res.success).toBe(false);
  });
});

/* ───────────── Editor role allowed ───────────── */

describe('scout-reports — editor role allowed (same surface as admin for review actions)', () => {
  beforeEach(() => {
    authContext = { ...authContext, role: 'editor' };
  });

  it('listAllScoutReports accepts editor (does not return permission error)', async () => {
    const res = await listAllScoutReports();
    // Either succeeds with empty list or fails with non-permission error — never "Sem permissão".
    expect(res.error ?? '').not.toMatch(/permissão/i);
  });

  it('rejectScoutReport accepts editor', async () => {
    const res = await rejectScoutReport(1);
    // Permission gate passed — proceeds to update.
    expect(res.error ?? '').not.toMatch(/permissão/i);
  });
});

/* ───────────── deleteScoutingReport: author or admin only ───────────── */

describe('scout-reports — deleteScoutingReport ownership rules', () => {
  it('rejects when report not found', async () => {
    reportSelectResult = { data: null, error: null };
    authContext = { ...authContext, role: 'editor' };
    const res = await deleteScoutingReport(99);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/não encontrado/i);
    expect(deleteCalls).toHaveLength(0);
  });

  it('allows author to delete own report (non-admin role)', async () => {
    reportSelectResult = {
      data: { id: 1, author_id: 'admin-001', player_id: 42 },
      error: null,
    };
    authContext = { ...authContext, role: 'editor', userId: 'admin-001' };
    const res = await deleteScoutingReport(1);
    expect(res.success).toBe(true);
    expect(deleteCalls.find((c) => c.table === 'scouting_reports')).toBeDefined();
  });

  it('rejects non-author non-admin (e.g. editor trying to delete someone else’s report)', async () => {
    reportSelectResult = {
      data: { id: 1, author_id: 'someone-else', player_id: 42 },
      error: null,
    };
    authContext = { ...authContext, role: 'editor', userId: 'editor-001' };
    const res = await deleteScoutingReport(1);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permissão/i);
    expect(deleteCalls).toHaveLength(0);
  });

  it('allows admin to delete any report', async () => {
    reportSelectResult = {
      data: { id: 1, author_id: 'someone-else', player_id: 42 },
      error: null,
    };
    authContext = { ...authContext, role: 'admin', userId: 'admin-001' };
    const res = await deleteScoutingReport(1);
    expect(res.success).toBe(true);
    expect(deleteCalls.find((c) => c.table === 'scouting_reports')).toBeDefined();
  });
});
