// src/lib/utils/playing-up.ts
// Detect if a player is competing above their natural age group
// Uses ZeroZero team history (team field like "Jun.C S15") + player DOB
// RELEVANT FILES: src/lib/constants.ts, src/components/common/PlayingUpBadge.tsx, src/lib/zerozero/parser.ts

/* ───────────── Season Helper ───────────── */

/** Season end year: Jul+ → next year, Jan-Jun → current year */
function getSeasonEndYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/* ───────────── Types ───────────── */

export type PlayingUpResult =
  | { isPlayingUp: false }
  | { isPlayingUp: true; regular: boolean; naturalAge: number; teamAge: number; yearsAbove: number };

/* ───────────── Parsers ───────────── */

/**
 * Extract the Sub-N number from a ZZ team string.
 * Handles: "Jun.C S15 C" → 15, "Jun.B S17" → 17, "Sub-13" → 13, "Fut.7 Jun.A S19" → 19
 * Returns null if no escalão found (e.g. senior teams).
 */
export function parseZzTeamSubLevel(teamStr: string | null | undefined): number | null {
  if (!teamStr) return null;
  // Try S{N} pattern first (most common in ZZ: "Jun.C S15 C")
  const sMatch = teamStr.match(/S(\d{1,2})\b/);
  if (sMatch) return parseInt(sMatch[1], 10);
  // Fallback: Sub-{N} pattern
  const subMatch = teamStr.match(/Sub-(\d{1,2})\b/i);
  if (subMatch) return parseInt(subMatch[1], 10);
  return null;
}

/**
 * Check if a ZZ team string represents the main/A team of the escalão.
 * "Jun.C S15" → true (no division letter after S15)
 * "Jun.C S15 A" → true (explicit A team — though rare in ZZ)
 * "Jun.C S15 B" → false (B team — secondary, used for younger players)
 * "Jun.C S15 C" → false
 * "Sub-13 B" → false
 *
 * Only the main team counts as "playing up" — B/C teams are where clubs
 * put younger players to gain experience in the higher escalão structure.
 */
export function isMainTeam(teamStr: string | null | undefined): boolean {
  if (!teamStr) return false;
  // Match S{N} or Sub-{N} and check what follows
  const sMatch = teamStr.match(/S(\d{1,2})\s*(.*)$/);
  if (sMatch) {
    const suffix = sMatch[2].trim();
    // No suffix or "A" = main team. "B", "C", etc. = secondary.
    return suffix === '' || suffix === 'A';
  }
  const subMatch = teamStr.match(/Sub-(\d{1,2})\s*(.*)$/i);
  if (subMatch) {
    const suffix = subMatch[2].trim();
    return suffix === '' || suffix === 'A';
  }
  return false;
}

/* ───────────── Detection ───────────── */

/**
 * Detect if a player is "playing up" from ZZ team history.
 * Looks at the most recent team entry's escalão vs the player's natural age group from DOB.
 *
 * Sub-15 has players born in 2011 (older), Sub-14 has 2012 (younger).
 * A player born 2012 (natural Sub-14) playing in Sub-15 (2011 generation) → playing up (+1 year).
 * Higher Sub-N = older players = playing above.
 */
export function detectPlayingUp(player: {
  dob: string | null;
  zzTeamHistory: { team?: string; season: string; games?: number }[] | null;
}): PlayingUpResult {
  if (!player.dob || !player.zzTeamHistory?.length) return { isPlayingUp: false };

  const birthYear = new Date(player.dob).getFullYear();
  if (isNaN(birthYear)) return { isPlayingUp: false };

  // Player's natural Sub-N (e.g., born 2012, season end 2026 → Sub-14)
  const endYear = getSeasonEndYear();
  const naturalAge = endYear - birthYear;
  if (naturalAge < 3 || naturalAge > 19) return { isPlayingUp: false };

  // Only consider the current season — past seasons don't count
  const currentSeason = player.zzTeamHistory[0]?.season;
  if (!currentSeason) return { isPlayingUp: false };
  const currentSeasonEntries = player.zzTeamHistory.filter((e) => e.season === currentSeason);

  // Find a main/A team entry in the current season that's above natural age group
  const mainEntries = currentSeasonEntries.filter((e) => e.team && isMainTeam(e.team));
  const aboveEntry = mainEntries.find((e) => {
    const subN = parseZzTeamSubLevel(e.team!);
    return subN !== null && subN > naturalAge;
  });
  if (!aboveEntry?.team) return { isPlayingUp: false };

  // Check regularity: ≥30% of total season games in the main team above = regular
  const mainAboveGames = mainEntries
    .filter((e) => { const n = parseZzTeamSubLevel(e.team!); return n !== null && n > naturalAge; })
    .reduce((sum, e) => sum + (e.games ?? 0), 0);
  const totalGames = currentSeasonEntries.reduce((sum, e) => sum + (e.games ?? 0), 0);
  const regular = totalGames === 0 || mainAboveGames >= totalGames * 0.3;

  const teamSubN = parseZzTeamSubLevel(aboveEntry.team);
  if (teamSubN === null) return { isPlayingUp: false };

  // Higher Sub-N = older age group. Sub-15 > Sub-14 means older players.
  // Player born 2012 (Sub-14) in Sub-15 team → teamSubN (15) > naturalAge (14) → 1 year above.
  const yearsAbove = teamSubN - naturalAge;
  if (yearsAbove <= 0) return { isPlayingUp: false };

  return { isPlayingUp: true, regular, naturalAge, teamAge: teamSubN, yearsAbove };
}
