// src/actions/scraping/bulk.ts
// Bulk scraping — batch update all players with external data from FPF and ZeroZero
// Auto-applies safe changes (photo, club, height, weight, nationality) without user confirmation
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/scraping/zerozero.ts, src/actions/scraping/zz-finder.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { normalizeCountry, clubsMatch, calcAgeFromDob } from './helpers';
import { fetchFpfData } from './fpf';
import { fetchZeroZeroData } from './zerozero';
import { searchZzMultiStrategy } from './zz-finder';

/* ───────────── Types ───────────── */

export interface BulkUpdateProgress {
  total: number;
  processed: number;
  fpfUpdated: number;
  zzUpdated: number;
  errors: number;
}

/* ───────────── Bulk Scrape ───────────── */

/** Bulk update a batch of players — auto-applies photo, club, height, weight, nationality changes */
export async function bulkScrapeExternalData(
  offset: number,
  limit: number,
  sources: ('fpf' | 'zerozero')[]
): Promise<BulkUpdateProgress & { hasMore: boolean }> {
  const { clubId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { total: 0, processed: 0, fpfUpdated: 0, zzUpdated: 0, errors: 0, hasMore: false };
  }
  const supabase = await createClient();

  let query = supabase.from('players').select('id, name, dob, fpf_link, zerozero_link, club, photo_url, zz_photo_url, height, weight, birth_country, nationality', { count: 'exact' }).eq('club_id', clubId);

  if (sources.length === 1 && sources[0] === 'fpf') {
    query = query.not('fpf_link', 'is', null).neq('fpf_link', '');
  } else if (sources.length === 1 && sources[0] === 'zerozero') {
    query = query.not('zerozero_link', 'is', null).neq('zerozero_link', '');
  } else {
    query = query.or('fpf_link.neq.,zerozero_link.neq.');
  }

  const { data: players, count } = await query.order('id').range(offset, offset + limit - 1);

  if (!players || players.length === 0) {
    return { total: count ?? 0, processed: offset, fpfUpdated: 0, zzUpdated: 0, errors: 0, hasMore: false };
  }

  let fpfUpdated = 0;
  let zzUpdated = 0;
  let errors = 0;

  for (const player of players) {
    if (fpfUpdated + zzUpdated + errors > 0) {
      // Random delay 2-4s between requests to avoid rate limiting (ZeroZero blocks rapid access)
      const delay = 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const autoUpdates: Record<string, unknown> = {};

      if (sources.includes('fpf') && player.fpf_link) {
        const data = await fetchFpfData(player.fpf_link);
        if (data) {
          fpfUpdated++;
          // Cache FPF fields
          await supabase.from('players').update({
            fpf_current_club: data.currentClub,
            fpf_last_checked: new Date().toISOString(),
            ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
          }).eq('id', player.id).eq('club_id', clubId);

          // Auto-apply: photo if player has none
          if (data.photoUrl && !player.photo_url && !player.zz_photo_url) {
            autoUpdates.photo_url = data.photoUrl;
          }
          // Club logo from FPF
          if (data.clubLogoUrl) {
            autoUpdates.club_logo_url = data.clubLogoUrl;
          }
          // Club if changed — includes "Sem Clube" (player left club per FPF season data)
          if (data.currentClub && (
            data.currentClub === 'Sem Clube'
              ? Boolean(player.club?.trim()) && player.club !== 'Sem Clube'
              : !clubsMatch(data.currentClub, player.club ?? '')
          )) {
            autoUpdates.club = data.currentClub;
          }
          // Nationality / birth country if empty
          if (data.nationality && !player.nationality) {
            autoUpdates.nationality = normalizeCountry(data.nationality);
          }
          if (data.birthCountry && !player.birth_country) {
            autoUpdates.birth_country = normalizeCountry(data.birthCountry);
          }
        } else errors++;
      }

      // Auto-find ZeroZero link if player has FPF data but no ZZ link
      if (sources.includes('fpf') && !player.zerozero_link && player.name && player.dob) {
        const expectedAge = calcAgeFromDob(player.dob);
        const zzMatch = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob);
        if (zzMatch) {
          const idMatch = zzMatch.url.match(/\/jogador\/[^/]+\/(\d+)/);
          await supabase.from('players').update({
            zerozero_link: zzMatch.url,
            zerozero_player_id: idMatch ? idMatch[1] : '',
          }).eq('id', player.id).eq('club_id', clubId);
          // Update local reference so ZZ scrape runs below
          player.zerozero_link = zzMatch.url;
        }
      }

      if (sources.includes('zerozero') && player.zerozero_link) {
        const data = await fetchZeroZeroData(player.zerozero_link);
        if (data) {
          zzUpdated++;
          // Cache ZZ fields
          await supabase.from('players').update({
            zz_current_club: data.currentClub,
            zz_current_team: data.currentTeam,
            zz_games_season: data.gamesSeason,
            zz_goals_season: data.goalsSeason,
            zz_height: data.height,
            zz_weight: data.weight,
            zz_photo_url: data.photoUrl,
            zz_team_history: data.teamHistory?.length ? data.teamHistory : null,
            zz_last_checked: new Date().toISOString(),
            ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
          }).eq('id', player.id).eq('club_id', clubId);

          // ZZ photo takes priority
          if (data.photoUrl) {
            autoUpdates.photo_url = data.photoUrl;
          }
          // Club logo
          if (data.clubLogoUrl) {
            autoUpdates.club_logo_url = data.clubLogoUrl;
          }
          if (data.currentClub && !clubsMatch(data.currentClub, player.club ?? '')) {
            autoUpdates.club = data.currentClub;
          }
          // Height/weight if missing or different
          if (data.height && !player.height) autoUpdates.height = data.height;
          if (data.weight && !player.weight) autoUpdates.weight = data.weight;
          // Nationality / birth country from ZZ if still empty
          if (data.nationality && !player.nationality && !autoUpdates.nationality) {
            autoUpdates.nationality = normalizeCountry(data.nationality);
          }
          if (data.birthCountry && !player.birth_country && !autoUpdates.birth_country) {
            autoUpdates.birth_country = normalizeCountry(data.birthCountry);
          }
        } else errors++;
      }

      // Apply auto-updates
      if (Object.keys(autoUpdates).length > 0) {
        await supabase.from('players').update(autoUpdates).eq('id', player.id).eq('club_id', clubId);
      }
    } catch {
      errors++;
    }
  }

  const hasMore = offset + players.length < (count ?? 0);
  return { total: count ?? 0, processed: offset + players.length, fpfUpdated, zzUpdated, errors, hasMore };
}
