// src/actions/__tests__/training-feedback.test.ts
// Unit tests for updateTrainingEvaluation — author_id reflects whoever evaluated, not whoever scheduled
// Guards: fixes bug where the scheduler's name appeared as author on evaluations filled by someone else
// RELEVANT FILES: src/actions/training-feedback.ts, src/lib/supabase/queries.ts

/* ───────────── Mock State ───────────── */

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
}

const updateCalls: UpdateCall[] = [];
let existingRow: { id: number; player_id: number; author_id: string; status: string } | null = null;
let authContext: { clubId: string; userId: string; role: string; isSuperadmin: boolean } = {
  clubId: 'club-001', userId: 'diogo-id', role: 'editor', isSuperadmin: false,
};

/* ───────────── Supabase Mock Builder ───────────── */

function makeQueryBuilder(table: string) {
  const builder: Record<string, jest.Mock> = {};

  builder.select = jest.fn().mockReturnValue(builder);
  builder.update = jest.fn((payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload });
    return builder;
  });
  builder.insert = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.order = jest.fn().mockReturnValue(builder);
  builder.limit = jest.fn().mockReturnValue(builder);
  builder.gt = jest.fn().mockReturnValue(builder);
  builder.is = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockImplementation(() => {
    if (table === 'training_feedback') return Promise.resolve({ data: existingRow, error: null });
    return Promise.resolve({ data: null, error: null });
  });
  builder.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (builder as any).then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return builder;
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: (table: string) => makeQueryBuilder(table),
  }),
}));

jest.mock('@/lib/supabase/club-context', () => ({
  getAuthContext: jest.fn().mockImplementation(() => Promise.resolve(authContext)),
  getActiveClub: jest.fn().mockImplementation(() => Promise.resolve({ ...authContext, club: { id: 'club-001', name: 'FC Test' } })),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/realtime/broadcast', () => ({
  broadcastRowMutation: jest.fn().mockResolvedValue(undefined),
  broadcastBulkMutation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/actions/notifications', () => ({
  notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
}));

import { updateTrainingEvaluation } from '../training-feedback';

/* ───────────── Helpers ───────────── */

function reset() {
  updateCalls.length = 0;
  existingRow = { id: 1, player_id: 42, author_id: 'ruben-id', status: 'realizado' };
  authContext = { clubId: 'club-001', userId: 'diogo-id', role: 'editor', isSuperadmin: false };
}

/* ───────────── updateTrainingEvaluation ───────────── */

describe('updateTrainingEvaluation', () => {
  beforeEach(reset);

  it('sets author_id to the user who submits the evaluation (not the original scheduler)', async () => {
    // Ruben scheduled the training (author_id: 'ruben-id'); Diogo now fills the evaluation.
    const result = await updateTrainingEvaluation({
      trainingId: 1,
      feedback: 'Bom passe, boa atitude',
      ratingPerformance: 3,
      ratingPotential: 4,
      decision: 'assinar',
    });

    expect(result.success).toBe(true);

    const update = updateCalls.find((c) => c.table === 'training_feedback');
    expect(update).toBeDefined();
    expect(update?.payload).toMatchObject({ author_id: 'diogo-id' });
  });

  it('allows an editor who is not the original scheduler to submit the evaluation', async () => {
    // Before the fix, only admin or the original author_id could update.
    authContext.role = 'editor';
    authContext.userId = 'diogo-id';
    existingRow!.author_id = 'ruben-id';

    const result = await updateTrainingEvaluation({
      trainingId: 1,
      feedback: 'Bem',
      ratingPerformance: 3,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows a recruiter who is not the original scheduler to submit the evaluation', async () => {
    authContext.role = 'recruiter';
    authContext.userId = 'joana-id';
    existingRow!.author_id = 'ruben-id';

    const result = await updateTrainingEvaluation({
      trainingId: 1,
      feedback: 'OK',
      ratingPerformance: 2,
    });

    expect(result.success).toBe(true);
  });

  it('rejects scouts (they do not evaluate trainings)', async () => {
    authContext.role = 'scout';
    authContext.userId = 'carlos-id';

    const result = await updateTrainingEvaluation({
      trainingId: 1,
      feedback: 'X',
      ratingPerformance: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/permiss/i);
  });

  it('returns "não encontrado" when the training does not exist', async () => {
    existingRow = null;

    const result = await updateTrainingEvaluation({
      trainingId: 999,
      feedback: 'X',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });
});
