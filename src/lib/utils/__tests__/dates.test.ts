// src/lib/utils/__tests__/dates.test.ts
// Tests for calendar date utilities (week ranges, week navigation)
// European convention: weeks start on Monday
// RELEVANT FILES: src/lib/utils/dates.ts, src/components/calendar/CalendarView.tsx

import { getWeekRange, shiftWeek } from '@/lib/utils/dates';

/* ───────────── getWeekRange ───────────── */

describe('getWeekRange', () => {
  it('returns Monday–Sunday for a mid-week date (Wednesday)', () => {
    // 2025-03-05 = Wednesday
    const range = getWeekRange('2025-03-05');
    expect(range.start).toBe('2025-03-03'); // Monday
    expect(range.end).toBe('2025-03-09');   // Sunday
  });

  it('returns correct range when input is Monday', () => {
    const range = getWeekRange('2025-03-03');
    expect(range.start).toBe('2025-03-03');
    expect(range.end).toBe('2025-03-09');
  });

  it('returns correct range when input is Sunday', () => {
    const range = getWeekRange('2025-03-09');
    expect(range.start).toBe('2025-03-03');
    expect(range.end).toBe('2025-03-09');
  });

  it('handles month boundary (spans two months)', () => {
    // 2025-02-28 = Friday → Monday = 2025-02-24, Sunday = 2025-03-02
    const range = getWeekRange('2025-02-28');
    expect(range.start).toBe('2025-02-24');
    expect(range.end).toBe('2025-03-02');
  });

  it('handles year boundary', () => {
    // 2025-01-01 = Wednesday → Monday = 2024-12-30
    const range = getWeekRange('2025-01-01');
    expect(range.start).toBe('2024-12-30');
    expect(range.end).toBe('2025-01-05');
  });
});

/* ───────────── shiftWeek ───────────── */

describe('shiftWeek', () => {
  it('shifts forward by one week', () => {
    expect(shiftWeek('2025-03-03', 1)).toBe('2025-03-10');
  });

  it('shifts backward by one week', () => {
    expect(shiftWeek('2025-03-10', -1)).toBe('2025-03-03');
  });

  it('shifts multiple weeks', () => {
    expect(shiftWeek('2025-03-03', 4)).toBe('2025-03-31');
  });

  it('handles month/year boundaries', () => {
    expect(shiftWeek('2024-12-30', 1)).toBe('2025-01-06');
  });
});
