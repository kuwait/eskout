// scripts/autolink_by_photo.ts
// Auto-link unlinked fpf_match_players to eskout players by matching FPF Person ID
// The Person ID appears in both: photo_url (eskout) and fpf_player_id (match_players)
// Run: npx tsx --env-file=.env.local scripts/autolink_by_photo.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;

async function paginatedFetch<T>(
  query: (offset: number, limit: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await query(offset, offset + PAGE - 1);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  console.log('1. Fetching eskout players with FPF photo URLs...');
  const players = await paginatedFetch((from, to) =>
    supabase.from('players')
      .select('id, photo_url')
      .not('photo_url', 'is', null)
      .ilike('photo_url', '%Person%id=%')
      .range(from, to)
  );

  // Build map: FPF Person ID → eskout player ID
  const eskoutByPersonId = new Map<number, number>();
  for (const p of players) {
    const m = (p as { id: number; photo_url: string }).photo_url.match(/id=(\d+)/);
    if (m) eskoutByPersonId.set(parseInt(m[1]), (p as { id: number }).id);
  }
  console.log(`   ${eskoutByPersonId.size} players with FPF Person ID in photo_url`);

  console.log('2. Fetching unlinked fpf_match_players...');
  const unlinked = await paginatedFetch((from, to) =>
    supabase.from('fpf_match_players')
      .select('id, fpf_player_id, player_name, team_name')
      .is('eskout_player_id', null)
      .not('fpf_player_id', 'is', null)
      .range(from, to)
  );
  console.log(`   ${unlinked.length} unlinked match player records`);

  // Find matches
  type UnlinkedRow = { id: number; fpf_player_id: number; player_name: string; team_name: string };
  const toLink: { matchPlayerId: number; eskoutId: number; name: string }[] = [];
  for (const row of unlinked as UnlinkedRow[]) {
    const eskoutId = eskoutByPersonId.get(row.fpf_player_id);
    if (eskoutId) {
      toLink.push({ matchPlayerId: row.id, eskoutId, name: row.player_name });
    }
  }

  // Deduplicate — same eskout player may appear in multiple matches
  const uniqueEskout = new Set(toLink.map(l => l.eskoutId));
  console.log(`\n3. Auto-linkable: ${toLink.length} records (${uniqueEskout.size} unique players)`);

  if (toLink.length === 0) {
    console.log('Nothing to link.');
    return;
  }

  // Execute links in batches
  let linked = 0;
  let errors = 0;
  for (let i = 0; i < toLink.length; i += 100) {
    const batch = toLink.slice(i, i + 100);
    for (const { matchPlayerId, eskoutId, name } of batch) {
      const { error } = await supabase
        .from('fpf_match_players')
        .update({ eskout_player_id: eskoutId })
        .eq('id', matchPlayerId);
      if (error) {
        console.error(`  Error linking ${name}: ${error.message}`);
        errors++;
      } else {
        linked++;
      }
    }
    if (i % 500 === 0 && i > 0) console.log(`   ... ${linked} linked so far`);
  }

  console.log(`\n✅ Done. Linked ${linked} records, ${errors} errors.`);
  console.log(`   ${uniqueEskout.size} unique eskout players now have competition stats.`);
}

main().catch(console.error);
