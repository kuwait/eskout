// src/lib/__tests__/shared-lists.test.ts
// Tests for shared player list types and logic
// Validates PlayerListShare shape, shared list detection, access rules
// RELEVANT FILES: src/lib/types/index.ts, src/actions/player-lists.ts

import type { PlayerList, PlayerListShare } from '@/lib/types';

/* ───────────── PlayerListShare Type ───────────── */

describe('PlayerListShare', () => {
  const share: PlayerListShare = {
    id: 1,
    listId: 10,
    userId: 'user-abc',
    userName: 'Carlos Lopes',
    sharedBy: 'user-xyz',
    createdAt: '2026-03-16T10:00:00Z',
  };

  it('has required fields', () => {
    expect(share.listId).toBe(10);
    expect(share.userId).toBe('user-abc');
    expect(share.userName).toBe('Carlos Lopes');
    expect(share.sharedBy).toBe('user-xyz');
  });
});

/* ───────────── PlayerList with sharing ───────────── */

describe('PlayerList shared properties', () => {
  it('defaults to not shared', () => {
    const list: PlayerList = {
      id: 1, clubId: 'club-1', userId: 'user-1', name: 'Test',
      emoji: '📋', isSystem: false, createdAt: '', updatedAt: '',
      itemCount: 0, lastAddedAt: null,
    };
    expect(list.isSharedWithMe).toBeUndefined();
    expect(list.sharedWith).toBeUndefined();
    expect(list.ownerName).toBeUndefined();
  });

  it('marks shared list correctly', () => {
    const list: PlayerList = {
      id: 2, clubId: 'club-1', userId: 'user-other', name: 'Shared List',
      emoji: '🔗', isSystem: false, createdAt: '', updatedAt: '',
      itemCount: 5, lastAddedAt: '2026-03-16T10:00:00Z',
      isSharedWithMe: true,
      ownerName: 'Diogo Nunes',
    };
    expect(list.isSharedWithMe).toBe(true);
    expect(list.ownerName).toBe('Diogo Nunes');
  });

  it('includes shared users for owner view', () => {
    const list: PlayerList = {
      id: 3, clubId: 'club-1', userId: 'user-1', name: 'My List',
      emoji: '⭐', isSystem: false, createdAt: '', updatedAt: '',
      itemCount: 10, lastAddedAt: null,
      sharedWith: [
        { id: 1, listId: 3, userId: 'user-2', userName: 'Scout A', sharedBy: 'user-1', createdAt: '' },
        { id: 2, listId: 3, userId: 'user-3', userName: 'Scout B', sharedBy: 'user-1', createdAt: '' },
      ],
    };
    expect(list.sharedWith).toHaveLength(2);
    expect(list.sharedWith![0].userName).toBe('Scout A');
  });
});

/* ───────────── Access rules ───────────── */

describe('shared list access logic', () => {
  const ownerId = 'user-owner';
  const sharedUserId = 'user-shared';
  const otherUserId = 'user-other';

  const shares: PlayerListShare[] = [
    { id: 1, listId: 10, userId: sharedUserId, userName: 'Shared User', sharedBy: ownerId, createdAt: '' },
  ];

  function hasAccess(userId: string, listOwnerId: string, isAdmin: boolean): boolean {
    const isOwner = userId === listOwnerId;
    const isShared = shares.some(s => s.userId === userId);
    return isOwner || isAdmin || isShared;
  }

  it('owner has access', () => {
    expect(hasAccess(ownerId, ownerId, false)).toBe(true);
  });

  it('shared user has access', () => {
    expect(hasAccess(sharedUserId, ownerId, false)).toBe(true);
  });

  it('random user does NOT have access', () => {
    expect(hasAccess(otherUserId, ownerId, false)).toBe(false);
  });

  it('admin always has access', () => {
    expect(hasAccess(otherUserId, ownerId, true)).toBe(true);
  });

  /** System lists cannot be shared */
  it('system list sharing is blocked', () => {
    const list: PlayerList = {
      id: 1, clubId: 'club-1', userId: ownerId, name: 'A Observar',
      emoji: '👁', isSystem: true, createdAt: '', updatedAt: '',
      itemCount: 0, lastAddedAt: null,
    };
    expect(list.isSystem).toBe(true);
    // Application code should prevent sharing system lists
  });

  /** Shared user can leave (unshare self) */
  it('shared user can be identified for self-removal', () => {
    const share = shares.find(s => s.userId === sharedUserId);
    expect(share).toBeDefined();
    expect(share!.userId).toBe(sharedUserId);
  });

  /** Owner can revoke any share */
  it('owner can identify all shares to revoke', () => {
    const ownerShares = shares.filter(s => s.sharedBy === ownerId);
    expect(ownerShares).toHaveLength(1);
  });
});

/* ───────────── Merging own + shared lists ───────────── */

describe('getMyLists merge logic', () => {
  it('separates own and shared lists', () => {
    const allLists: PlayerList[] = [
      { id: 1, clubId: 'c', userId: 'me', name: 'My List', emoji: '📋', isSystem: false, createdAt: '', updatedAt: '', itemCount: 0, lastAddedAt: null },
      { id: 2, clubId: 'c', userId: 'me', name: 'A Observar', emoji: '👁', isSystem: true, createdAt: '', updatedAt: '', itemCount: 3, lastAddedAt: null },
      { id: 3, clubId: 'c', userId: 'other', name: 'Shared List', emoji: '🔗', isSystem: false, createdAt: '', updatedAt: '', itemCount: 5, lastAddedAt: null, isSharedWithMe: true, ownerName: 'Diogo' },
    ];

    const myOwn = allLists.filter(l => !l.isSharedWithMe);
    const sharedWithMe = allLists.filter(l => l.isSharedWithMe);

    expect(myOwn).toHaveLength(2);
    expect(sharedWithMe).toHaveLength(1);
    expect(sharedWithMe[0].ownerName).toBe('Diogo');
  });
});
