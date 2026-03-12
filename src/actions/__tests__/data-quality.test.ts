// src/actions/__tests__/data-quality.test.ts
// Unit tests for data-quality helper functions (isStale, getLastCheckpoint)
// Ensures grace period, checkpoint-based stale detection work correctly
// RELEVANT FILES: src/actions/data-quality-helpers.ts, src/actions/data-quality.ts

import { isStale, getLastCheckpoint, NEW_PLAYER_GRACE_MS } from '../data-quality-helpers';

/* ───────────── Helpers ───────────── */

const ONE_DAY = 24 * 60 * 60 * 1000;

/** Create a timestamp for a specific date */
function ts(dateStr: string): number {
  return new Date(dateStr).getTime();
}

/* ───────────── getLastCheckpoint ───────────── */

describe('getLastCheckpoint', () => {
  it('Dec 2025 → Oct 1 2025', () => {
    expect(getLastCheckpoint(ts('2025-12-15'))).toEqual(new Date(2025, 9, 1));
  });

  it('Feb 2026 → Oct 1 2025 (before Mar 1)', () => {
    expect(getLastCheckpoint(ts('2026-02-10'))).toEqual(new Date(2025, 9, 1));
  });

  it('Mar 1 2026 → Mar 1 2026 (exactly on checkpoint)', () => {
    expect(getLastCheckpoint(ts('2026-03-01'))).toEqual(new Date(2026, 2, 1));
  });

  it('Mar 12 2026 → Mar 1 2026', () => {
    expect(getLastCheckpoint(ts('2026-03-12'))).toEqual(new Date(2026, 2, 1));
  });

  it('Apr 2026 → Mar 1 2026', () => {
    expect(getLastCheckpoint(ts('2026-04-15'))).toEqual(new Date(2026, 2, 1));
  });

  it('Sep 2026 → Mar 1 2026 (before Oct)', () => {
    expect(getLastCheckpoint(ts('2026-09-20'))).toEqual(new Date(2026, 2, 1));
  });

  it('Oct 1 2026 → Oct 1 2026 (exactly on checkpoint)', () => {
    expect(getLastCheckpoint(ts('2026-10-01'))).toEqual(new Date(2026, 9, 1));
  });

  it('Nov 2026 → Oct 1 2026', () => {
    expect(getLastCheckpoint(ts('2026-11-15'))).toEqual(new Date(2026, 9, 1));
  });

  it('Jan 2026 → Oct 1 2025', () => {
    expect(getLastCheckpoint(ts('2026-01-05'))).toEqual(new Date(2025, 9, 1));
  });
});

/* ───────────── isStale ───────────── */

describe('isStale', () => {
  // Now = March 12, 2026
  // Last checkpoint = Mar 1, 2026
  const NOW = ts('2026-03-12T12:00:00Z');

  /* ── Never checked (lastChecked = null) ── */

  describe('when lastChecked is null', () => {
    it('returns true if no createdAt', () => {
      expect(isStale(null, NOW)).toBe(true);
    });

    it('returns true if createdAt is null', () => {
      expect(isStale(null, NOW, null)).toBe(true);
    });

    it('returns false if player was created 1 day ago (within grace)', () => {
      const created = new Date(NOW - ONE_DAY).toISOString();
      expect(isStale(null, NOW, created)).toBe(false);
    });

    it('returns false if player was created 6 days ago (within grace)', () => {
      const created = new Date(NOW - 6 * ONE_DAY).toISOString();
      expect(isStale(null, NOW, created)).toBe(false);
    });

    it('returns true if player was created 8 days ago (past grace)', () => {
      const created = new Date(NOW - 8 * ONE_DAY).toISOString();
      expect(isStale(null, NOW, created)).toBe(true);
    });

    it('returns true if createdAt is invalid', () => {
      expect(isStale(null, NOW, 'not-a-date')).toBe(true);
    });
  });

  /* ── Checkpoint-based stale detection ── */

  describe('checkpoint-based stale detection', () => {
    // NOW = Mar 12, 2026 → checkpoint = Mar 1, 2026

    it('NOT stale if checked Mar 5 2026 (after checkpoint)', () => {
      expect(isStale('2026-03-05T10:00:00Z', NOW)).toBe(false);
    });

    it('NOT stale if checked Mar 1 2026 (on checkpoint)', () => {
      expect(isStale('2026-03-01T00:00:00Z', NOW)).toBe(false);
    });

    it('stale if checked Feb 28 2026 (before checkpoint)', () => {
      expect(isStale('2026-02-28T23:59:59Z', NOW)).toBe(true);
    });

    it('stale if checked Oct 15 2025 (before Mar 1 checkpoint)', () => {
      expect(isStale('2025-10-15T10:00:00Z', NOW)).toBe(true);
    });

    it('stale if checked Sep 2025 (before Oct 1 2025 checkpoint too)', () => {
      expect(isStale('2025-09-01T10:00:00Z', NOW)).toBe(true);
    });

    it('stale if checked 2 years ago', () => {
      expect(isStale('2024-01-01T10:00:00Z', NOW)).toBe(true);
    });

    it('returns true if lastChecked is invalid', () => {
      expect(isStale('not-a-date', NOW)).toBe(true);
    });
  });

  describe('different times of year', () => {
    it('Nov 2025: checked Oct 5 2025 → NOT stale (after Oct 1 checkpoint)', () => {
      const now = ts('2025-11-15T12:00:00Z');
      expect(isStale('2025-10-05T10:00:00Z', now)).toBe(false);
    });

    it('Nov 2025: checked Sep 20 2025 → stale (before Oct 1 checkpoint)', () => {
      const now = ts('2025-11-15T12:00:00Z');
      expect(isStale('2025-09-20T10:00:00Z', now)).toBe(true);
    });

    it('Feb 2026: checked Oct 5 2025 → NOT stale (Oct 1 is last checkpoint)', () => {
      const now = ts('2026-02-15T12:00:00Z');
      expect(isStale('2025-10-05T10:00:00Z', now)).toBe(false);
    });

    it('Sep 2026: checked Mar 5 2026 → NOT stale (Mar 1 is last checkpoint)', () => {
      const now = ts('2026-09-15T12:00:00Z');
      expect(isStale('2026-03-05T10:00:00Z', now)).toBe(false);
    });

    it('Sep 2026: checked Feb 20 2026 → stale (before Mar 1 checkpoint)', () => {
      const now = ts('2026-09-15T12:00:00Z');
      expect(isStale('2026-02-20T10:00:00Z', now)).toBe(true);
    });
  });

  /* ── Thresholds ── */

  describe('thresholds', () => {
    it('NEW_PLAYER_GRACE_MS is 7 days', () => {
      expect(NEW_PLAYER_GRACE_MS).toBe(7 * ONE_DAY);
    });
  });
});
