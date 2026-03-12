// src/actions/data-quality.ts
// Server actions for fetching players with missing data (FPF, ZZ, photo)
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
}

export interface DataQualityResult {
  players: DataGapPlayer[];
  totals: {
    total: number;
    missingFpf: number;
    missingZz: number;
    missingBoth: number;
    missingPhoto: number;
  };
  error?: string;
}

/* ───────────── Query ───────────── */

export async function getDataQuality(): Promise<DataQualityResult> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin') {
    return { players: [], totals: { total: 0, missingFpf: 0, missingZz: 0, missingBoth: 0, missingPhoto: 0 }, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  // Fetch all players with only the columns we need — paginated to bypass 1000-row limit
  const PAGE = 1000;
  const allRows: {
    id: number;
    name: string;
    club: string | null;
    position_normalized: string | null;
    dob: string | null;
    fpf_link: string | null;
    zerozero_link: string | null;
    photo_url: string | null;
    zz_photo_url: string | null;
  }[] = [];

  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, club, position_normalized, dob, fpf_link, zerozero_link, photo_url, zz_photo_url')
      .eq('club_id', clubId)
      .order('name')
      .range(offset, offset + PAGE - 1);
    if (error || !data?.length) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Map and compute gaps
  const players: DataGapPlayer[] = allRows.map((r) => ({
    id: r.id,
    name: r.name,
    club: r.club ?? '',
    positionNormalized: r.position_normalized ?? '',
    dob: r.dob,
    hasFpf: Boolean(r.fpf_link?.trim()),
    hasZz: Boolean(r.zerozero_link?.trim()),
    hasPhoto: Boolean(r.photo_url?.trim() || r.zz_photo_url?.trim()),
  }));

  const missingFpf = players.filter((p) => !p.hasFpf).length;
  const missingZz = players.filter((p) => !p.hasZz).length;
  const missingBoth = players.filter((p) => !p.hasFpf && !p.hasZz).length;
  const missingPhoto = players.filter((p) => !p.hasPhoto).length;

  return {
    players,
    totals: { total: players.length, missingFpf, missingZz, missingBoth, missingPhoto },
  };
}
