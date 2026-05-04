// scripts/triage_2011_h2.ts
// Extract players born 2011-07-07 to 2011-12-31 in Diogo's club, dump to markdown grouped by club.
// One-off triage helper to build the "Sub-15 — Inscrição 2026/27" list.
// RELEVANT FILES: scripts/insert_triage_to_list.ts, src/actions/player-lists.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ───────────── Env loader (.env.local) ───────────── */

try {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // ignore — env may already be set
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ───────────── Config ───────────── */

const OWNER_EMAIL = 'diogocamposnunes@gmail.com';
const DOB_FROM = '2011-07-07';
const DOB_TO = '2011-12-31';

/* ───────────── Main ───────────── */

async function main() {
  // 1. Find Diogo's auth user via admin API (email lives in auth.users, not profiles)
  const { data: authList, error: ae } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (ae) throw ae;
  const authUser = authList.users.find(
    (u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
  if (!authUser) throw new Error(`Auth user not found: ${OWNER_EMAIL}`);

  const { data: profile, error: pe } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', authUser.id)
    .single();
  if (pe || !profile) throw new Error(`Profile not found for ${OWNER_EMAIL} — ${pe?.message}`);

  const { data: memberships, error: me } = await supabase
    .from('club_memberships')
    .select('club_id, role, clubs!inner(id, name, slug)')
    .eq('user_id', profile.id);
  if (me) throw me;

  const allClubs = memberships || [];
  console.log(`User: ${profile.full_name} (${profile.id})`);
  console.log(`Clubs: ${allClubs.map((m: any) => `${m.clubs.name} [${m.role}]`).join(', ')}`);

  if (allClubs.length === 0) throw new Error('No club membership found');
  if (allClubs.length > 1) {
    console.warn('Multiple clubs; using first:', (allClubs[0] as any).clubs.name);
  }
  const clubId = allClubs[0].club_id;
  const clubName = (allClubs[0] as any).clubs.name;

  // 2. Fetch all players in DOB window for this club
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('players')
      .select(
        `id, name, dob, club, club_id,
         position_normalized, secondary_position, tertiary_position,
         foot, department_opinion, recruitment_status,
         pending_approval,
         fpf_link, fpf_current_club,
         zerozero_link, zz_current_club, zz_current_team,
         scouting_reports(id, rating),
         quick_scout_reports(id, rating_overall),
         scout_evaluations(rating)`
      )
      .eq('club_id', clubId)
      .gte('dob', DOB_FROM)
      .lte('dob', DOB_TO)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Found ${all.length} players in club "${clubName}" born ${DOB_FROM} to ${DOB_TO}`);

  const pending = all.filter((p) => p.pending_approval).length;
  if (pending > 0) console.log(`(${pending} pending approval — included in dump but flagged)`);

  // 3. Group by club
  const byClub = new Map<string, any[]>();
  for (const p of all) {
    const club = (p.club || '(sem clube)').trim();
    if (!byClub.has(club)) byClub.set(club, []);
    byClub.get(club)!.push(p);
  }

  // Sort: clubs by player count desc, then name asc
  const clubsSorted = [...byClub.entries()].sort((a, b) => {
    const d = b[1].length - a[1].length;
    return d !== 0 ? d : a[0].localeCompare(b[0]);
  });

  // 4. Build markdown
  const lines: string[] = [];
  lines.push(`# Triagem — Jogadores nascidos ${DOB_FROM} a ${DOB_TO}`);
  lines.push('');
  lines.push(`**Tenant:** ${clubName}`);
  lines.push(`**Total:** ${all.length} jogadores em ${clubsSorted.length} clubes`);
  lines.push('');
  lines.push('> Marcação por clube: 🟢 Distrito do Porto · 🟡 perto (≤60km) · 🔴 longe · ❓ a confirmar');
  lines.push('> Pos = principal / secundária / terciária · Aval = 1-5 · Rel = nº relatórios · QSR = nº quick reports');
  lines.push('');

  for (const [club, players] of clubsSorted) {
    lines.push(`## ${club} _(${players.length})_`);
    lines.push('');
    lines.push('| Nome | DOB | Pos | Pé | Aval | Opinião | Rel | QSR | Pend |');
    lines.push('|------|-----|-----|----|------|---------|-----|-----|------|');
    const enriched = players.map((p) => {
      const ratings: number[] = [];
      for (const r of p.scouting_reports || []) if (r.rating != null) ratings.push(Number(r.rating));
      for (const r of p.quick_scout_reports || []) if (r.rating_overall != null) ratings.push(Number(r.rating_overall));
      for (const r of p.scout_evaluations || []) if (r.rating != null) ratings.push(Number(r.rating));
      const avg = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null;
      return { ...p, _avgRating: avg, _ratingCount: ratings.length };
    });
    const sorted = enriched.sort((a, b) => (b._avgRating ?? -1) - (a._avgRating ?? -1));
    for (const p of sorted) {
      const pos = [p.position_normalized, p.secondary_position, p.tertiary_position]
        .filter(Boolean)
        .join('/');
      const reports = Array.isArray(p.scouting_reports) ? p.scouting_reports.length : 0;
      const qsr = Array.isArray(p.quick_scout_reports) ? p.quick_scout_reports.length : 0;
      const aval = p._avgRating != null ? `${p._avgRating.toFixed(1)} (${p._ratingCount})` : '';
      const pend = p.pending_approval ? '⚠️' : '';
      lines.push(
        `| ${p.name} | ${p.dob} | ${pos} | ${p.foot || ''} | ${aval} | ${p.department_opinion ?? ''} | ${reports} | ${qsr} | ${pend} |`
      );
    }
    lines.push('');
  }

  const outDir = resolve(__dirname, '..', 'data');
  const outMd = resolve(outDir, 'triage_2011_h2.md');
  const outJson = resolve(outDir, 'triage_2011_h2.json');
  writeFileSync(outMd, lines.join('\n'), 'utf8');
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        clubId,
        ownerProfileId: profile.id,
        dobFrom: DOB_FROM,
        dobTo: DOB_TO,
        players: all.map((p) => ({
          id: p.id,
          name: p.name,
          dob: p.dob,
          club: p.club,
          department_opinion: p.department_opinion,
          pending_approval: p.pending_approval,
        })),
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
