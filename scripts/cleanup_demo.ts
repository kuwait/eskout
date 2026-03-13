// scripts/cleanup_demo.ts
// Cleans up demo data (players, squads, notes, etc.)
// Run with: npx tsx --env-file=.env.local scripts/cleanup_demo.ts

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: club } = await sb.from('clubs').select('id').eq('slug', 'demo').single();
  if (!club) { console.log('No demo club found'); return; }
  const clubId = club.id;
  console.log('Demo club:', clubId);

  // Clean up all demo data in dependency order
  await sb.from('squad_players').delete().eq('club_id', clubId);
  console.log('squad_players: deleted');
  await sb.from('squads').delete().eq('club_id', clubId);
  console.log('squads: deleted');
  await sb.from('observation_notes').delete().eq('club_id', clubId);
  console.log('observation_notes: deleted');
  await sb.from('status_history').delete().eq('club_id', clubId);
  console.log('status_history: deleted');
  await sb.from('calendar_events').delete().eq('club_id', clubId);
  console.log('calendar_events: deleted');
  await sb.from('players').delete().eq('club_id', clubId);
  console.log('players: deleted');

  console.log('\nDemo data cleaned up!');
}

main().catch(e => { console.error(e); process.exit(1); });
