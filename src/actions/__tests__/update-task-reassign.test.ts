// src/actions/__tests__/update-task-reassign.test.ts
// Unit tests for updateTask reassignment path — owner can reassign, admin can reassign anyone,
// scouts rejected as targets, notification fires only on cross-user reassign
// RELEVANT FILES: src/actions/tasks.ts, src/components/tasks/TaskFormDialog.tsx

/* ───────────── Mock state ───────────── */

interface UpdateCall { table: string; payload: Record<string, unknown> }

const updateCalls: UpdateCall[] = [];
const notifyCalls: Array<Record<string, unknown>> = [];

let existingTask: { user_id: string; source: string; title: string; player_id: number | null; due_date: string | null } | null = null;
let targetMembershipRole: string | null = 'editor';
let authContext: { clubId: string; userId: string; role: string; isSuperadmin: boolean } = {
  clubId: 'club-001', userId: 'owner-001', role: 'editor', isSuperadmin: false,
};

/* ───────────── Supabase Mock ───────────── */

function makeQueryBuilder(table: string) {
  const builder: Record<string, jest.Mock> = {};

  builder.select = jest.fn().mockReturnValue(builder);
  builder.update = jest.fn((payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload });
    return builder;
  });
  builder.insert = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockImplementation(() => {
    if (table === 'user_tasks') {
      return Promise.resolve({ data: existingTask, error: null });
    }
    if (table === 'club_memberships') {
      return Promise.resolve({ data: targetMembershipRole ? { role: targetMembershipRole } : null, error: null });
    }
    if (table === 'profiles') {
      return Promise.resolve({ data: { full_name: 'Diogo Nunes' }, error: null });
    }
    if (table === 'clubs') {
      return Promise.resolve({ data: { name: 'Boavista FC' }, error: null });
    }
    if (table === 'players') {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
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
}));

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

jest.mock('@/lib/realtime/broadcast', () => ({
  broadcastRowMutation: jest.fn().mockResolvedValue(undefined),
  broadcastBulkMutation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/actions/notifications', () => ({
  notifyTaskAssigned: jest.fn().mockImplementation((ctx: Record<string, unknown>) => {
    notifyCalls.push(ctx);
  }),
}));

import { updateTask } from '../tasks';

function reset() {
  updateCalls.length = 0;
  notifyCalls.length = 0;
  existingTask = { user_id: 'owner-001', source: 'manual', title: 'Tarefa', player_id: null, due_date: null };
  targetMembershipRole = 'editor';
  authContext = { clubId: 'club-001', userId: 'owner-001', role: 'editor', isSuperadmin: false };
}

/* ───────────── Tests ───────────── */

describe('updateTask — reassignment', () => {
  beforeEach(reset);

  it('owner can reassign their own task to another editor', async () => {
    const res = await updateTask(1, { assignedToUserId: 'other-001' });
    expect(res.success).toBe(true);
    const upd = updateCalls.find((c) => c.table === 'user_tasks');
    expect(upd).toBeDefined();
    expect(upd!.payload).toMatchObject({ user_id: 'other-001' });
  });

  it('non-owner non-admin cannot reassign', async () => {
    authContext = { clubId: 'club-001', userId: 'someone-else', role: 'editor', isSuperadmin: false };
    const res = await updateTask(1, { assignedToUserId: 'other-001' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permissão/i);
    expect(updateCalls.find((c) => c.table === 'user_tasks')).toBeUndefined();
  });

  it('admin can reassign any task', async () => {
    authContext = { clubId: 'club-001', userId: 'admin-001', role: 'admin', isSuperadmin: false };
    const res = await updateTask(1, { assignedToUserId: 'other-001' });
    expect(res.success).toBe(true);
    const upd = updateCalls.find((c) => c.table === 'user_tasks');
    expect(upd!.payload).toMatchObject({ user_id: 'other-001' });
  });

  it('rejects assigning to a scout (no task list for scouts)', async () => {
    targetMembershipRole = 'scout';
    const res = await updateTask(1, { assignedToUserId: 'scout-001' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/observadores/i);
    expect(updateCalls.find((c) => c.table === 'user_tasks')).toBeUndefined();
  });

  it('rejects assigning to a user not in the club', async () => {
    targetMembershipRole = null; // no membership found
    const res = await updateTask(1, { assignedToUserId: 'outsider-001' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/não pertence ao clube/i);
  });

  it('does not send a notification when assigning to self', async () => {
    const res = await updateTask(1, { assignedToUserId: 'owner-001', title: 'Renamed' });
    expect(res.success).toBe(true);
    expect(notifyCalls).toHaveLength(0);
    // user_id should NOT be in payload (no reassignment) — only the title change
    const upd = updateCalls.find((c) => c.table === 'user_tasks');
    expect(upd!.payload).not.toHaveProperty('user_id');
    expect(upd!.payload).toHaveProperty('title', 'Renamed');
  });

  it('sends a notification to the new assignee on cross-user reassign', async () => {
    await updateTask(1, { assignedToUserId: 'other-001' });
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0]).toMatchObject({
      targetUserId: 'other-001',
      assignedByUserId: 'owner-001',
      taskTitle: 'Tarefa',
      taskSource: 'manual',
    });
  });

  it('does not invoke reassignment logic when assignedToUserId is omitted', async () => {
    const res = await updateTask(1, { title: 'Just a rename' });
    expect(res.success).toBe(true);
    expect(notifyCalls).toHaveLength(0);
    const upd = updateCalls.find((c) => c.table === 'user_tasks');
    expect(upd!.payload).not.toHaveProperty('user_id');
  });
});
