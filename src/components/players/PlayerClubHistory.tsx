// src/components/players/PlayerClubHistory.tsx
// Displays player's club history and season stats from ZeroZero data
// Table layout grouped visually by season — visible to all roles
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/lib/types/index.ts, src/actions/scraping.ts

import { Trophy, ArrowUpRight } from 'lucide-react';
import { parseZzTeamSubLevel, isMainTeam } from '@/lib/utils/playing-up';

interface TeamHistoryEntry {
  club: string;
  team?: string;
  season: string;
  games: number;
  goals: number;
}

interface PlayerClubHistoryProps {
  zzTeamHistory: TeamHistoryEntry[] | null;
  zzCurrentClub: string | null;
  zzCurrentTeam: string | null;
  zzGamesSeason: number | null;
  zzGoalsSeason: number | null;
  zzLastChecked: string | null;
  /** Player DOB — used to detect playing-up entries */
  dob?: string | null;
}

/** Check if a team entry represents playing above natural age group for a given season.
 *  Only the main/A team counts — B/C teams put younger players to gain experience. */
function isPlayingUp(entry: TeamHistoryEntry, birthYear: number | null): boolean {
  if (!birthYear || !entry.team) return false;
  if (!isMainTeam(entry.team)) return false;
  const teamSubN = parseZzTeamSubLevel(entry.team);
  if (teamSubN === null) return false;
  // Compute the season end year from the entry season (e.g. "2025/26" → 2026)
  const seasonMatch = entry.season.match(/^20\d{2}\/(\d{2})$/);
  if (!seasonMatch) return false;
  const endYear = 2000 + parseInt(seasonMatch[1], 10);
  const naturalAge = endYear - birthYear;
  return teamSubN > naturalAge;
}

export function PlayerClubHistory({
  zzTeamHistory,
  zzCurrentClub,
  zzCurrentTeam,
  zzLastChecked,
  dob,
}: PlayerClubHistoryProps) {
  const VALID_SEASON = /^20\d{2}\/\d{2}$/;
  const history = zzTeamHistory?.filter((e) => VALID_SEASON.test(e.season)) ?? [];
  const birthYear = dob ? new Date(dob).getFullYear() : null;
  const hasHistory = history.length > 0;
  const hasCurrentClub = zzCurrentClub || zzCurrentTeam;

  if (!hasHistory && !hasCurrentClub) return null;

  const currentSeason = hasHistory ? history[0].season : null;
  const currentSeasonEntries = currentSeason ? history.filter((e) => e.season === currentSeason) : [];
  const currentSeasonGames = currentSeasonEntries.reduce((sum, e) => sum + (e.games || 0), 0);
  const currentSeasonGoals = currentSeasonEntries.reduce((sum, e) => sum + (e.goals || 0), 0);
  const currentClubName = zzCurrentTeam || zzCurrentClub || (currentSeasonEntries.length > 0 ? currentSeasonEntries[0].club : null);

  const totals = hasHistory
    ? history.reduce(
        (acc, e) => ({ games: acc.games + (e.games || 0), goals: acc.goals + (e.goals || 0) }),
        { games: 0, goals: 0 }
      )
    : null;

  let seasonIdx = 0;

  return (
    <div className="space-y-3">
      {/* Current season highlight */}
      {currentClubName && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Trophy className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Época Atual</p>
            <div className="flex items-baseline gap-2.5">
              <span className="text-sm font-bold text-blue-900">{currentClubName}</span>
              {currentSeasonEntries.length > 0 && (
                <span className="text-xs font-medium text-blue-600">
                  {currentSeasonGames} jogos · {currentSeasonGoals} golos
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Career history table */}
      {hasHistory && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-neutral-50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-16 px-3 py-2 text-left">Época</th>
                <th className="px-2 py-2 text-left">Equipa</th>
                <th className="w-10 px-2 py-2 text-center">J</th>
                <th className="w-10 px-2 py-2 text-center">G</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => {
                const prevSeason = i > 0 ? history[i - 1].season : null;
                const isFirstInSeason = entry.season !== prevSeason;
                if (isFirstInSeason && i > 0) seasonIdx++;
                const rowBg = seasonIdx % 2 === 0 ? 'bg-white' : 'bg-blue-50/20';
                const borderClass = i > 0 && isFirstInSeason ? 'border-t border-neutral-200' : i > 0 ? 'border-t border-neutral-100' : '';

                return (
                  <tr key={`${entry.season}-${entry.club}-${i}`} className={`${rowBg} ${borderClass}`}>
                    <td className="px-3 py-2 align-top">
                      {isFirstInSeason ? (
                        <span className="font-mono text-[11px] font-semibold text-neutral-500">{entry.season}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-semibold">{entry.club}</span>
                      {entry.team && (
                        <span className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium ${isPlayingUp(entry, birthYear) ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-500'}`}>{entry.team}</span>
                      )}
                      {isPlayingUp(entry, birthYear) && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 p-0.5 text-amber-600" title="Joga acima do escalão natural">
                          <ArrowUpRight className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums font-medium text-blue-600">
                      {entry.games > 0 ? entry.games : '-'}
                    </td>
                    <td className={`px-2 py-2 text-center tabular-nums font-semibold ${entry.goals > 0 ? 'text-green-600' : 'text-neutral-400'}`}>
                      {entry.goals > 0 ? entry.goals : entry.games > 0 ? '0' : '-'}
                    </td>
                  </tr>
                );
              })}
              {totals && totals.games > 0 && (
                <tr className="border-t-2 border-neutral-200 bg-green-50/50">
                  <td className="px-3 py-2.5 font-bold" colSpan={2}>Total</td>
                  <td className="px-2 py-2.5 text-center font-bold tabular-nums text-blue-600">{totals.games}</td>
                  <td className="px-2 py-2.5 text-center font-bold tabular-nums text-green-600">{totals.goals}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {zzLastChecked && (
        <p className="text-[10px] text-muted-foreground/50">
          Atualizado: {new Date(zzLastChecked).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}
