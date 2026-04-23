// src/actions/__tests__/users.test.ts
// Unit tests for inviteUser / deleteUser / reactivateUser
// Guards: invite email must redirect to /definir-password; soft delete must only touch profiles + auth
// RELEVANT FILES: src/actions/users.ts, src/app/definir-password/page.tsx, supabase/migrations/023_soft_delete_users.sql

/* ───────────── Supabase Mock Builder ───────────── */

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
}

const updateCalls: UpdateCall[] = [];
const banCalls: { userId: string; banDuration: string | undefined }[] = [];
const inviteCalls: { email: string; options: Record<string, unknown> }[] = [];
const passwordUpdates: { userId: string; password: string | undefined }[] = [];

/** Chainable mock mimicking Supabase. Terminal methods resolve to { error: null }. */
function makeQueryBuilder(table: string) {
  const builder: Record<string, jest.Mock> = {};
  const terminal = { data: null, error: null };

  builder.update = jest.fn((payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload });
    return builder;
  });
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.select = jest.fn().mockReturnValue(builder);
  builder.insert = jest.fn().mockReturnValue(builder);
  builder.upsert = jest.fn().mockReturnValue(builder);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (builder as any).then = (resolve: (v: unknown) => void) => resolve(terminal);
  return builder;
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn().mockResolvedValue({
    from: (table: string) => makeQueryBuilder(table),
    auth: {
      admin: {
        updateUserById: jest.fn((userId: string, opts: { ban_duration?: string; password?: string }) => {
          if ('ban_duration' in opts) banCalls.push({ userId, banDuration: opts.ban_duration });
          if ('password' in opts) passwordUpdates.push({ userId, password: opts.password });
          return Promise.resolve({ error: null });
        }),
        inviteUserByEmail: jest.fn((email: string, options: Record<string, unknown>) => {
          inviteCalls.push({ email, options });
          return Promise.resolve({ data: { user: { id: 'new-user-001' } }, error: null });
        }),
      },
    },
  }),
}));

jest.mock('@/lib/supabase/club-context', () => ({
  getAuthContext: jest.fn().mockResolvedValue({
    clubId: 'club-001',
    userId: 'admin-001',
    role: 'admin',
    isSuperadmin: false,
  }),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

import { deleteUser, inviteUser, reactivateUser, setUserPassword } from '../users';

/* ───────────── Helpers ───────────── */

function reset() {
  updateCalls.length = 0;
  banCalls.length = 0;
  inviteCalls.length = 0;
  passwordUpdates.length = 0;
}

/* ───────────── inviteUser ───────────── */

describe('inviteUser', () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    reset();
    process.env.NEXT_PUBLIC_APP_URL = 'https://eskout.com';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  });

  it('passes redirectTo pointing to /definir-password so the invitee is sent to the set-password page', async () => {
    const result = await inviteUser('new@example.com', 'scout', 'Novo Utilizador');

    expect(result.success).toBe(true);
    expect(inviteCalls).toHaveLength(1);
    expect(inviteCalls[0].email).toBe('new@example.com');
    expect(inviteCalls[0].options.redirectTo).toBe('https://eskout.com/definir-password');
  });
});

/* ───────────── deleteUser ───────────── */

describe('deleteUser', () => {
  beforeEach(reset);

  it('succeeds and updates profile.active = false + bans auth user', async () => {
    const result = await deleteUser('user-to-deactivate');

    expect(result).toEqual({ success: true });

    const profileUpdate = updateCalls.find((c) => c.table === 'profiles');
    expect(profileUpdate).toBeDefined();
    expect(profileUpdate?.payload).toEqual({ active: false });

    expect(banCalls).toHaveLength(1);
    expect(banCalls[0].userId).toBe('user-to-deactivate');
    expect(banCalls[0].banDuration).toBeTruthy();
  });

  it('never writes `active` to club_memberships (column does not exist in schema)', async () => {
    await deleteUser('user-to-deactivate');

    const membershipWritesWithActive = updateCalls.filter(
      (c) => c.table === 'club_memberships' && 'active' in c.payload,
    );
    expect(membershipWritesWithActive).toHaveLength(0);
  });

  it('refuses self-deactivation', async () => {
    const result = await deleteUser('admin-001');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/própria conta/);
  });
});

/* ───────────── reactivateUser ───────────── */

describe('reactivateUser', () => {
  beforeEach(reset);

  it('succeeds and updates profile.active = true + unbans auth user', async () => {
    const result = await reactivateUser('user-to-reactivate');

    expect(result).toEqual({ success: true });

    const profileUpdate = updateCalls.find((c) => c.table === 'profiles');
    expect(profileUpdate).toBeDefined();
    expect(profileUpdate?.payload).toEqual({ active: true });

    expect(banCalls).toHaveLength(1);
    expect(banCalls[0].userId).toBe('user-to-reactivate');
    expect(banCalls[0].banDuration).toBe('none');
  });

  it('never writes `active` to club_memberships (column does not exist in schema)', async () => {
    await reactivateUser('user-to-reactivate');

    const membershipWritesWithActive = updateCalls.filter(
      (c) => c.table === 'club_memberships' && 'active' in c.payload,
    );
    expect(membershipWritesWithActive).toHaveLength(0);
  });
});

/* ───────────── setUserPassword ───────────── */

describe('setUserPassword', () => {
  beforeEach(reset);

  it('sets the password via auth admin API', async () => {
    const result = await setUserPassword('user-001', 'novaPass123');

    expect(result).toEqual({ success: true });
    expect(passwordUpdates).toHaveLength(1);
    expect(passwordUpdates[0]).toEqual({ userId: 'user-001', password: 'novaPass123' });
  });

  it('refuses passwords shorter than 6 characters', async () => {
    const result = await setUserPassword('user-001', 'abc');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/6 caracteres/);
    expect(passwordUpdates).toHaveLength(0);
  });

  it('refuses changing the admin\'s own password (must use regular flow)', async () => {
    const result = await setUserPassword('admin-001', 'novaPass123');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/própria/);
    expect(passwordUpdates).toHaveLength(0);
  });
});
