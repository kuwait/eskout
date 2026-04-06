// src/lib/fpf-browse-helpers.ts
// Pure helper functions for FPF browse — time period filtering, dedup key building, day tab generation
// Extracted from BrowseFpfClient for testability and reuse
// RELEVANT FILES: src/app/observacoes/[id]/browse-fpf/BrowseFpfClient.tsx, src/actions/scouting-games.ts

export type TimePeriod = 'all' | 'morning' | 'afternoon' | 'evening';

/** Check if a match time falls in a period */
export function matchTimeInPeriod(matchTime: string | null, period: TimePeriod): boolean {
  if (period === 'all') return true;
  if (!matchTime) return true; // Show matches without time in all periods
  const [h] = matchTime.split(':').map(Number);
  if (period === 'morning') return h < 12;
  if (period === 'afternoon') return h >= 12 && h < 18;
  return h >= 18; // evening
}

/** Build composite dedup key for a game (same logic as server-side addBatchGames) */
export function buildGameKey(homeTeam: string, awayTeam: string, matchDate: string, matchTime: string | null): string {
  return `${homeTeam.trim().toLowerCase()}|${awayTeam.trim().toLowerCase()}|${matchDate}|${matchTime ?? ''}`;
}

/** Get day tabs for a round date range (inclusive) */
export function getRoundDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const current = new Date(sy, sm - 1, sd);
  while (true) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (dateStr > endDate) break;
    days.push(dateStr);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/** Filter duplicates from a batch of matches based on existing game keys */
export function filterDuplicateMatches<T extends { homeTeam: string; awayTeam: string; matchDate: string; matchTime?: string | null }>(
  matches: T[],
  existingKeys: Set<string>,
): { toInsert: T[]; duplicates: number } {
  const toInsert = matches.filter((m) => {
    const key = buildGameKey(m.homeTeam, m.awayTeam, m.matchDate, m.matchTime ?? null);
    return !existingKeys.has(key);
  });
  return { toInsert, duplicates: matches.length - toInsert.length };
}
