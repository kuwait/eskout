// src/lib/__tests__/wall-clock-dates.test.ts
// Tests that pipeline/task date formatting preserves wall-clock time (no timezone conversion)
// Pipeline dates (meeting_date, training_date, signing_date, due_date) are stored as TIMESTAMPTZ
// but represent wall-clock values — "17:30" means 17:30 local, regardless of UTC offset.
// RELEVANT FILES: src/components/pipeline/PipelineCard.tsx, src/components/tasks/tasks-utils.ts, src/components/players/profile-utils.ts, src/lib/utils/activity-labels.ts

/**
 * These tests verify that date/time formatting functions use string slicing
 * instead of new Date() + toLocaleString(), which would apply timezone conversion
 * and shift times by the UTC offset (e.g. +1h in Portugal summer time).
 *
 * The core invariant: if a date string contains "T17:30", the formatted output
 * must show "17:30" — never "18:30" or any other shifted time.
 */

/* ───────────── Imports ───────────── */

// We import from the source modules to test their actual behavior.
// Some are component-internal functions, so we test via re-export or inline.

import { formatDueDate } from '@/components/tasks/tasks-utils';
import { formatDateTime } from '@/components/players/profile-utils';
import { formatDateStr } from '@/lib/utils/activity-labels';

/* ───────────── Test Data ───────────── */

/** Simulates a TIMESTAMPTZ value from Supabase — stored as UTC but intended as wall-clock 17:30 */
const UTC_ISO = '2026-04-14T17:30:00+00:00';
/** Same but without explicit offset — Supabase sometimes returns this format */
const UTC_ISO_Z = '2026-04-14T17:30:00Z';
/** Naive ISO string (no timezone info) — as sent from client */
const NAIVE_ISO = '2026-04-14T17:30:00';
/** Date-only string (no time component) */
const DATE_ONLY = '2026-04-14';
/** Midnight timestamp — time should not be displayed */
const MIDNIGHT_ISO = '2026-04-14T00:00:00+00:00';

/* ───────────── formatDueDate (tasks-utils) ───────────── */

describe('formatDueDate — wall-clock preservation', () => {
  it('preserves 17:30 from UTC ISO string (no timezone shift)', () => {
    const result = formatDueDate(UTC_ISO);
    expect(result).toContain('17:30');
    expect(result).not.toContain('18:30');
    expect(result).not.toContain('16:30');
  });

  it('preserves 17:30 from UTC ISO with Z suffix', () => {
    const result = formatDueDate(UTC_ISO_Z);
    expect(result).toContain('17:30');
  });

  it('preserves 17:30 from naive ISO string', () => {
    const result = formatDueDate(NAIVE_ISO);
    expect(result).toContain('17:30');
  });

  it('does not show time for date-only strings', () => {
    const result = formatDueDate(DATE_ONLY);
    expect(result).not.toContain(':');
  });

  it('does not show time for midnight timestamps', () => {
    const result = formatDueDate(MIDNIGHT_ISO);
    expect(result).not.toContain('00:00');
  });

  it('shows correct date part (14/04)', () => {
    const result = formatDueDate(UTC_ISO);
    expect(result).toContain('14/04');
  });
});

/* ───────────── formatDateTime (profile-utils) ───────────── */

describe('formatDateTime — wall-clock preservation', () => {
  it('preserves 17:30 from UTC ISO string (no timezone shift)', () => {
    const result = formatDateTime(UTC_ISO);
    expect(result).toContain('17:30');
    expect(result).not.toContain('18:30');
    expect(result).not.toContain('16:30');
  });

  it('preserves 17:30 from UTC ISO with Z suffix', () => {
    const result = formatDateTime(UTC_ISO_Z);
    expect(result).toContain('17:30');
  });

  it('preserves 17:30 from naive ISO string', () => {
    const result = formatDateTime(NAIVE_ISO);
    expect(result).toContain('17:30');
  });

  it('shows date in dd/MM/yyyy format', () => {
    const result = formatDateTime(UTC_ISO);
    expect(result).toContain('14/04/2026');
  });

  it('does not show time for midnight timestamps', () => {
    const result = formatDateTime(MIDNIGHT_ISO);
    expect(result).not.toContain('00:00');
    expect(result).toContain('14/04/2026');
  });

  it('handles date-only strings', () => {
    const result = formatDateTime(DATE_ONLY);
    expect(result).toContain('14/04/2026');
    expect(result).not.toContain(':');
  });
});

/* ───────────── formatDateStr (activity-labels) ───────────── */

describe('formatDateStr — wall-clock preservation', () => {
  it('preserves 17:30 from UTC ISO string (no timezone shift)', () => {
    const result = formatDateStr(UTC_ISO);
    expect(result).toContain('17:30');
    expect(result).not.toContain('18:30');
    expect(result).not.toContain('16:30');
  });

  it('preserves 17:30 from UTC ISO with Z suffix', () => {
    const result = formatDateStr(UTC_ISO_Z);
    expect(result).toContain('17:30');
  });

  it('preserves 17:30 from naive ISO string', () => {
    const result = formatDateStr(NAIVE_ISO);
    expect(result).toContain('17:30');
  });

  it('shows date in dd/MM/yyyy format', () => {
    const result = formatDateStr(UTC_ISO);
    expect(result).toContain('14/04/2026');
  });

  it('does not show time for midnight timestamps', () => {
    const result = formatDateStr(MIDNIGHT_ISO);
    expect(result).not.toContain('00:00');
  });

  it('handles date-only strings gracefully', () => {
    const result = formatDateStr(DATE_ONLY);
    expect(result).toContain('14/04/2026');
    expect(result).not.toContain(':');
  });
});

/* ───────────── Cross-function consistency ───────────── */

describe('Cross-function time consistency', () => {
  const testTimes = ['09:00', '12:30', '17:30', '21:45', '23:59'];

  it.each(testTimes)('all formatters show %s consistently for the same input', (time) => {
    const isoStr = `2026-04-14T${time}:00+00:00`;

    const dueDate = formatDueDate(isoStr);
    const dateTime = formatDateTime(isoStr);
    const dateStr = formatDateStr(isoStr);

    // All must contain the original time, never a shifted version
    expect(dueDate).toContain(time);
    expect(dateTime).toContain(time);
    expect(dateStr).toContain(time);
  });

  it('formatters agree on date-only (no time) display', () => {
    // None should show a time component for date-only strings
    const dueDate = formatDueDate(DATE_ONLY);
    const dateTime = formatDateTime(DATE_ONLY);
    const dateStr = formatDateStr(DATE_ONLY);

    expect(dueDate).not.toMatch(/\d{2}:\d{2}/);
    expect(dateTime).not.toMatch(/\d{2}:\d{2}/);
    expect(dateStr).not.toMatch(/\d{2}:\d{2}/);
  });
});
