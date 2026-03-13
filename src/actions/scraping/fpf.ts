// src/actions/scraping/fpf.ts
// FPF (Federação Portuguesa de Futebol) scraper — extracts player data from FPF player pages
// Parses the embedded `var model = {...}` JSON for club, photo, DOB, nationality
// RELEVANT FILES: src/actions/scraping/helpers.ts, src/actions/scraping/unified.ts, src/actions/scraping/links.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { HEADERS, clubsMatch } from './helpers';

/* ───────────── Types ───────────── */

export interface FpfScrapeResult {
  success: boolean;
  club: string | null;
  photoUrl: string | null;
  birthCountry: string | null;
  nationality: string | null;
  clubChanged: boolean;
}

/* ───────────── Helpers ───────────── */

/** Returns the current FPF season string, e.g. "2025-2026". Season starts July 1. */
function getCurrentFpfSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed: 0=Jan, 6=Jul
  // Before July → season started previous year (e.g. Mar 2026 → "2025-2026")
  const startYear = month < 6 ? year - 1 : year;
  return `${startYear}-${startYear + 1}`;
}

/* ───────────── FPF Parser ───────────── */

/** Parse FPF player page — extracts data from embedded `var model = {...}` JSON */
export async function fetchFpfData(fpfLink: string) {
  try {
    const res = await fetch(fpfLink, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) return null;

    const html = await res.text();

    // FPF embeds player data as `var model = { ... };` in a <script> tag
    const modelMatch = html.match(/var\s+model\s*=\s*(\{[\s\S]*?\});/);
    if (!modelMatch) return null;

    const model = JSON.parse(modelMatch[1]);

    // BirthDate: FPF model uses various formats — "dd/MM/yyyy", ISO, "27 de março de 2012", .NET JSON date
    let dob: string | null = null;
    const rawDob = (model.BirthDate || model.DateOfBirth || model.DataNascimento) as string | null;
    if (rawDob) {
      const ddMM = rawDob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (ddMM) {
        dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`; // → yyyy-MM-dd
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDob)) {
        dob = rawDob.slice(0, 10);
      } else {
        // Portuguese format: "27 de março de 2012"
        const PT_MONTHS: Record<string, string> = {
          janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04',
          maio: '05', junho: '06', julho: '07', agosto: '08',
          setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
        };
        const ptMatch = rawDob.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
        if (ptMatch) {
          const mm = PT_MONTHS[ptMatch[2].toLowerCase()];
          if (mm) dob = `${ptMatch[3]}-${mm}-${ptMatch[1].padStart(2, '0')}`;
        }
      }
      // .NET JSON date format: "/Date(1332806400000)/"
      if (!dob) {
        const dotNet = rawDob.match(/\/Date\((\d+)\)\//);
        if (dotNet) {
          const d = new Date(parseInt(dotNet[1], 10));
          if (!isNaN(d.getTime())) dob = d.toISOString().slice(0, 10);
        }
      }
      // Last resort: try native Date parser for any unrecognized format
      if (!dob) {
        const d = new Date(rawDob);
        if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
          dob = d.toISOString().slice(0, 10);
        } else {
          console.warn('[FPF] Could not parse BirthDate:', rawDob);
        }
      }
    }

    // Club logo from model.CurrentClubImage (most reliable) or first Clubs entry
    const clubLogoUrl = (model.CurrentClubImage as string)
      || (Array.isArray(model.Clubs) && model.Clubs.length > 0 ? (model.Clubs[0].Image as string) : null)
      || null;

    // Reject FPF placeholder images (relative path, not a real player photo)
    const rawPhoto = (model.Image as string) || null;
    const photoUrl = rawPhoto && rawPhoto.startsWith('http') && !rawPhoto.includes('placeholder') ? rawPhoto : null;

    const nationality = (model.Nationality || model.Nacionalidade) as string | null;
    // Fallback: if no birth country data, assume same as nationality
    const birthCountry = (model.BirthCountry || model.CountryOfBirth || model.PlaceOfBirth || model.PaisNascimento || model.BirthPlace || nationality) as string | null;

    // CurrentClub in FPF is NOT reliable — it keeps the last club even after the player left.
    // Cross-check with the Clubs array: if the current season is missing, player is "Sem Clube".
    const currentSeason = getCurrentFpfSeason();
    const clubs = Array.isArray(model.Clubs) ? model.Clubs as { Season: string; Name: string }[] : [];
    const hasCurrentSeason = clubs.some(c => c.Season === currentSeason);
    const currentClub = hasCurrentSeason
      ? (model.CurrentClub as string) || 'Sem Clube'
      : 'Sem Clube';

    return {
      currentClub,
      photoUrl,
      fullName: (model.FullName as string) || null,
      dob,
      birthCountry,
      nationality,
      clubLogoUrl,
    };
  } catch {
    return null;
  }
}

/* ───────────── Server Action ───────────── */

/** Scrape FPF for a single player — returns scraped data for the client to decide what to update */
export async function scrapePlayerFpf(playerId: number): Promise<FpfScrapeResult> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('fpf_link, club, photo_url, zz_photo_url')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player?.fpf_link) return { success: false, club: null, photoUrl: null, birthCountry: null, nationality: null, clubChanged: false };

  const data = await fetchFpfData(player.fpf_link);
  if (!data) return { success: false, club: null, photoUrl: null, birthCountry: null, nationality: null, clubChanged: false };

  // Always update fpf_current_club, club_logo_url, and fpf_last_checked
  await supabase.from('players').update({
    fpf_current_club: data.currentClub,
    fpf_last_checked: new Date().toISOString(),
    ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
  }).eq('id', playerId).eq('club_id', clubId);

  // "Sem Clube" = player left club — flag as change if player currently has a different club
  const clubChanged = data.currentClub === 'Sem Clube'
    ? Boolean(player.club?.trim()) && player.club !== 'Sem Clube'
    : !clubsMatch(data.currentClub!, player.club ?? '');

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true, club: data.currentClub, photoUrl: data.photoUrl, birthCountry: data.birthCountry, nationality: data.nationality, clubChanged };
}
