// src/actions/data-quality.ts
// Server actions for fetching players with data quality issues
// Used by the admin data quality page to identify gaps for manual updates
// RELEVANT FILES: src/app/admin/dados/page.tsx, src/lib/supabase/club-context.ts, src/lib/supabase/server.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';

/* ───────────── Types ───────────── */

export interface DataGapPlayer {
  id: number;
  name: string;
  club: string;
  positionNormalized: string;
  dob: string | null;
  hasFpf: boolean;
  hasZz: boolean;
  hasPhoto: boolean;
  hasPosition: boolean;
  hasDob: boolean;
  hasNationality: boolean;
  hasFoot: boolean;
  fpfClubMismatch: boolean;
  fpfCurrentClub: string | null;
  staleData: boolean;
  staleFpf: boolean;
  staleZz: boolean;
  duplicateKey: string | null;
}

export interface DataQualityTotals {
  total: number;
  missingFpf: number;
  missingZz: number;
  missingBoth: number;
  missingPhoto: number;
  missingPosition: number;
  missingDob: number;
  missingNationality: number;
  missingFoot: number;
  fpfClubMismatch: number;
  staleData: number;
  duplicates: number;
}

export interface DataQualityResult {
  players: DataGapPlayer[];
  totals: DataQualityTotals;
  error?: string;
}

/* ───────────── Constants ───────────── */

/** Threshold for considering external data stale (1 year in ms) */
const STALE_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;

/* ───────────── Query ───────────── */

export async function getDataQuality(): Promise<DataQualityResult> {
  const { clubId, role } = await getActiveClub();
  const emptyTotals: DataQualityTotals = {
    total: 0, missingFpf: 0, missingZz: 0, missingBoth: 0, missingPhoto: 0,
    missingPosition: 0, missingDob: 0, missingNationality: 0, missingFoot: 0,
    fpfClubMismatch: 0, staleData: 0, duplicates: 0,
  };

  if (role !== 'admin') {
    return { players: [], totals: emptyTotals, error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const now = Date.now();

  // Fetch all players with columns needed for quality checks — paginated to bypass 1000-row limit
  const PAGE = 1000;
  const SELECT = [
    'id', 'name', 'club', 'position_normalized', 'dob',
    'fpf_link', 'zerozero_link', 'photo_url', 'zz_photo_url',
    'foot', 'nationality',
    'fpf_current_club', 'fpf_last_checked',
    'zz_current_club', 'zz_last_checked',
  ].join(', ');

  type Row = {
    id: number;
    name: string;
    club: string | null;
    position_normalized: string | null;
    dob: string | null;
    fpf_link: string | null;
    zerozero_link: string | null;
    photo_url: string | null;
    zz_photo_url: string | null;
    foot: string | null;
    nationality: string | null;
    fpf_current_club: string | null;
    fpf_last_checked: string | null;
    zz_current_club: string | null;
    zz_last_checked: string | null;
  };

  const allRows: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('players')
      .select(SELECT)
      .eq('club_id', clubId)
      .order('name')
      .range(offset, offset + PAGE - 1);
    if (error || !data?.length) break;
    allRows.push(...(data as unknown as Row[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Build name+dob frequency map for duplicate detection
  const dupeMap = new Map<string, number>();
  for (const r of allRows) {
    if (!r.dob) continue;
    const key = `${r.name.toLowerCase().trim()}|${r.dob}`;
    dupeMap.set(key, (dupeMap.get(key) ?? 0) + 1);
  }

  // Map and compute gaps
  const players: DataGapPlayer[] = allRows.map((r) => {
    const hasFpf = Boolean(r.fpf_link?.trim());
    const hasZz = Boolean(r.zerozero_link?.trim());
    const hasPhoto = Boolean(r.photo_url?.trim() || r.zz_photo_url?.trim());
    const hasPosition = Boolean(r.position_normalized?.trim());
    const hasDob = Boolean(r.dob);
    const hasNationality = Boolean(r.nationality?.trim());
    const hasFoot = Boolean(r.foot?.trim());

    // FPF club mismatch: only when both fpf_current_club and club exist
    const fpfClub = r.fpf_current_club?.trim().toLowerCase() ?? '';
    const playerClub = (r.club ?? '').trim().toLowerCase();
    const fpfClubMismatch = Boolean(fpfClub && playerClub && fpfClub !== playerClub);

    // Stale external data: has link but last check > 3 months ago (or never checked)
    const staleFpf = hasFpf && isStale(r.fpf_last_checked, now);
    const staleZz = hasZz && isStale(r.zz_last_checked, now);

    // Duplicate: same name + DOB appears more than once
    const dupeKey = r.dob ? `${r.name.toLowerCase().trim()}|${r.dob}` : null;
    const isDupe = dupeKey ? (dupeMap.get(dupeKey) ?? 0) > 1 : false;

    return {
      id: r.id,
      name: r.name,
      club: r.club ?? '',
      positionNormalized: r.position_normalized ?? '',
      dob: r.dob,
      hasFpf,
      hasZz,
      hasPhoto,
      hasPosition,
      hasDob,
      hasNationality,
      hasFoot,
      fpfClubMismatch,
      fpfCurrentClub: r.fpf_current_club,
      staleData: staleFpf || staleZz,
      staleFpf,
      staleZz,
      duplicateKey: isDupe ? dupeKey : null,
    };
  });

  const totals: DataQualityTotals = {
    total: players.length,
    missingFpf: players.filter((p) => !p.hasFpf).length,
    missingZz: players.filter((p) => !p.hasZz).length,
    missingBoth: players.filter((p) => !p.hasFpf && !p.hasZz).length,
    missingPhoto: players.filter((p) => !p.hasPhoto).length,
    missingPosition: players.filter((p) => !p.hasPosition).length,
    missingDob: players.filter((p) => !p.hasDob).length,
    missingNationality: players.filter((p) => !p.hasNationality).length,
    missingFoot: players.filter((p) => !p.hasFoot).length,
    fpfClubMismatch: players.filter((p) => p.fpfClubMismatch).length,
    staleData: players.filter((p) => p.staleData).length,
    duplicates: players.filter((p) => p.duplicateKey).length,
  };

  return { players, totals };
}

/* ───────────── Helpers ───────────── */

/** Check if a timestamp is older than the stale threshold (or never set) */
function isStale(lastChecked: string | null, now: number): boolean {
  if (!lastChecked) return true;
  const checked = new Date(lastChecked).getTime();
  if (isNaN(checked)) return true;
  return now - checked > STALE_THRESHOLD_MS;
}
