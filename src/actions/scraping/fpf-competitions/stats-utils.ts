// src/actions/scraping/fpf-competitions/stats-utils.ts
// Pure utility functions for FPF competition stats aggregation — no server dependencies
// Extracted from stats.ts so they can be exported (sync functions can't be exported from 'use server' files)
// RELEVANT FILES: src/actions/scraping/fpf-competitions/stats.ts, src/lib/types/index.ts

import type { FpfMatchPlayerRow } from '@/lib/types';

/* ───────────── Types ───────────── */

export interface PlayerStatRow {
  fpfPlayerId: number | null;
  playerName: string;
  teamName: string;
  gamesStarted: number;
  gamesAsSub: number;
  totalGames: number;
  totalMinutes: number;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  eskoutPlayerId: number | null;
}

/* ───────────── Aggregate Helper ───────────── */

/** Aggregate fpf_match_players rows into PlayerStatRow by fpf_player_id (or player_name as fallback) */
export function aggregatePlayers(rows: FpfMatchPlayerRow[]): PlayerStatRow[] {
  const map = new Map<string, PlayerStatRow>();

  for (const r of rows) {
    // Use fpf_player_id as key when available, fallback to name+team
    const key = r.fpf_player_id ? `id:${r.fpf_player_id}` : `name:${r.player_name}|${r.team_name}`;

    const existing = map.get(key);
    if (existing) {
      existing.gamesStarted += r.is_starter ? 1 : 0;
      existing.gamesAsSub += (!r.is_starter && (r.minutes_played ?? 0) > 0) ? 1 : 0;
      existing.totalGames += (r.is_starter || (r.minutes_played ?? 0) > 0) ? 1 : 0;
      existing.totalMinutes += r.minutes_played ?? 0;
      existing.goals += r.goals;
      existing.penaltyGoals += r.penalty_goals;
      existing.ownGoals += r.own_goals;
      existing.yellowCards += r.yellow_cards;
      existing.redCards += r.red_cards;
      // Keep the most recent team name (player may have transferred)
      if (r.team_name) existing.teamName = r.team_name;
      // Keep eskout link if found
      if (r.eskout_player_id) existing.eskoutPlayerId = r.eskout_player_id;
    } else {
      map.set(key, {
        fpfPlayerId: r.fpf_player_id,
        playerName: r.player_name,
        teamName: r.team_name,
        gamesStarted: r.is_starter ? 1 : 0,
        gamesAsSub: (!r.is_starter && (r.minutes_played ?? 0) > 0) ? 1 : 0,
        totalGames: (r.is_starter || (r.minutes_played ?? 0) > 0) ? 1 : 0,
        totalMinutes: r.minutes_played ?? 0,
        goals: r.goals,
        penaltyGoals: r.penalty_goals,
        ownGoals: r.own_goals,
        yellowCards: r.yellow_cards,
        redCards: r.red_cards,
        eskoutPlayerId: r.eskout_player_id,
      });
    }
  }

  return Array.from(map.values());
}
