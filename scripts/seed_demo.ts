// scripts/seed_demo.ts
// Creates a demo club with fictional players, squads, and pipeline data
// Run with: npx tsx scripts/seed_demo.ts
// RELEVANT FILES: supabase/migrations/062_demo_club.sql, src/actions/clubs.ts, src/lib/constants.ts

import { createClient } from '@supabase/supabase-js';

/* ───────────── Config ───────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DEMO_EMAIL = 'demo@eskout.com';
const DEMO_PASSWORD = 'demo-eskout-2026';
const DEMO_CLUB_NAME = 'FC Atlético Demo';
const DEMO_CLUB_SLUG = 'demo';

/* ───────────── Season Calculation ───────────── */

function getSeasonInfo() {
  const now = new Date();
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const startYear = endYear - 1;
  return { season: `${startYear}/${endYear}`, endYear };
}

/* ───────────── Portuguese Names ───────────── */

const FIRST_NAMES = [
  'Afonso', 'André', 'Bernardo', 'Bruno', 'Carlos', 'Daniel', 'David', 'Diogo',
  'Duarte', 'Eduardo', 'Filipe', 'Francisco', 'Gabriel', 'Gonçalo', 'Guilherme',
  'Gustavo', 'Henrique', 'Hugo', 'Igor', 'João', 'Jorge', 'José', 'Leonardo',
  'Lucas', 'Luís', 'Manuel', 'Marco', 'Martim', 'Mateus', 'Miguel', 'Nuno',
  'Pedro', 'Rafael', 'Renato', 'Ricardo', 'Rodrigo', 'Rúben', 'Salvador',
  'Samuel', 'Santiago', 'Simão', 'Tiago', 'Tomás', 'Vasco', 'Vicente',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues',
  'Martins', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Almeida',
  'Alves', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Sousa', 'Mendes',
  'Correia', 'Cardoso', 'Nunes', 'Soares', 'Vieira', 'Monteiro', 'Moreira',
  'Reis', 'Matos', 'Fonseca', 'Araújo', 'Tavares', 'Ramos', 'Lourenço',
  'Azevedo', 'Baptista', 'Coelho', 'Cunha', 'Machado',
];

const CLUBS = [
  'SC Braga', 'Vitória SC', 'Rio Ave FC', 'Gil Vicente FC', 'Moreirense FC',
  'Leixões SC', 'FC Paços de Ferreira', 'Varzim SC', 'Académico de Viseu',
  'CD Tondela', 'SC Covilhã', 'FC Arouca', 'FC Vizela', 'FC Felgueiras',
  'Padroense FC', 'FC Maia', 'Gondomar SC', 'AD Oliveirense',
];

type PositionCode = 'GR' | 'DD' | 'DE' | 'DC' | 'MDC' | 'MC' | 'MOC' | 'ED' | 'EE' | 'PL';

const POSITIONS: PositionCode[] = ['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'];

const OPINIONS = [
  '1ª Escolha', '2ª Escolha', 'Acompanhar', 'Por Observar',
  'Urgente Observar', 'Sem interesse', 'Potencial', 'Ver em treino',
] as const;

const RECRUITMENT_STATUSES = [
  'por_tratar', 'em_contacto', 'vir_treinar', 'reuniao_marcada', 'a_decidir',
] as const;

const FEET = ['Dir', 'Esq', 'Amb'] as const;

/* ───────────── Helpers ───────────── */

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function randomDob(birthYear: number): string {
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* ───────────── Generate Players ───────────── */

interface DemoPlayer {
  name: string;
  dob: string;
  club: string;
  position_normalized: PositionCode;
  secondary_position: PositionCode | null;
  foot: string;
  department_opinion: string;
  recruitment_status: string | null;
  zz_height: number | null;
  zz_weight: number | null;
}

function generatePlayers(birthYear: number, count: number): DemoPlayer[] {
  const players: DemoPlayer[] = [];
  // Ensure position coverage: at least 1 per position
  const positionQueue = [...POSITIONS];

  for (let i = 0; i < count; i++) {
    const pos = positionQueue.length > 0 ? positionQueue.pop()! : pick(POSITIONS);
    const secondaryPos = Math.random() > 0.5 ? pick(POSITIONS.filter(p => p !== pos)) : null;
    const hasRecruitment = Math.random() > 0.3;
    const age = new Date().getFullYear() - birthYear;
    const baseHeight = 140 + age * 5;
    const baseWeight = 30 + age * 3;

    players.push({
      name: randomName(),
      dob: randomDob(birthYear),
      club: pick(CLUBS),
      position_normalized: pos,
      secondary_position: secondaryPos,
      foot: pick(FEET),
      department_opinion: pick(OPINIONS),
      recruitment_status: hasRecruitment ? pick(RECRUITMENT_STATUSES) : null,
      zz_height: Math.round(baseHeight + (Math.random() * 20 - 10)),
      zz_weight: Math.round(baseWeight + (Math.random() * 10 - 5)),
    });
  }

  return players;
}

/* ───────────── Observation Notes ───────────── */

const NOTE_TEMPLATES = [
  'Bom posicionamento defensivo. Lê bem o jogo e antecipa as jogadas adversárias.',
  'Tecnicamente evoluído para a idade. Bom passe curto e domínio de bola.',
  'Velocidade acima da média. Desequilibra no 1v1 pelo corredor.',
  'Boa capacidade de finalização. Remate forte e preciso com o pé direito.',
  'Precisa melhorar a intensidade sem bola. Por vezes perde-se taticamente.',
  'Excelente no jogo aéreo para a idade. Impõe-se fisicamente.',
  'Criativo no último terço. Bom passe de ruptura e visão de jogo.',
  'Boa atitude competitiva. Líder natural dentro de campo.',
  'Tem de trabalhar a saída de bola sob pressão. Comete erros quando pressionado.',
  'Jogador interessante mas ainda muito inconsistente. Precisa de mais observações.',
  'Destaque no torneio de Braga. Marcou 2 golos e fez 1 assistência.',
  'Observado no jogo contra o FC Porto. Muito bom 1º tempo, baixou no 2º.',
];

/* ───────────── Main ───────────── */

async function main() {
  const { season, endYear } = getSeasonInfo();
  console.log(`Season: ${season}, endYear: ${endYear}`);

  // ── 1. Create or find demo club ──
  console.log('\n1. Creating demo club...');
  const { data: existingClub } = await supabase
    .from('clubs')
    .select('id')
    .eq('slug', DEMO_CLUB_SLUG)
    .maybeSingle();

  let clubId: string;

  if (existingClub) {
    clubId = existingClub.id;
    console.log(`  Club already exists: ${clubId}`);
    // Ensure is_demo flag is set
    await supabase.from('clubs').update({ is_demo: true, is_test: true }).eq('id', clubId);
  } else {
    const { data: club, error } = await supabase
      .from('clubs')
      .insert({ name: DEMO_CLUB_NAME, slug: DEMO_CLUB_SLUG, is_demo: true, is_test: true })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to create club: ${error.message}`);
    clubId = club!.id;
    console.log(`  Created club: ${clubId}`);
  }

  // ── 2. Create or find demo user ──
  console.log('\n2. Creating demo user...');
  const { data: authData } = await supabase.auth.admin.listUsers();
  const existingUser = authData?.users?.find(u => u.email === DEMO_EMAIL);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    console.log(`  User already exists: ${userId}`);
  } else {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Utilizador Demo' },
    });
    if (error) throw new Error(`Failed to create user: ${error.message}`);
    userId = newUser.user.id;
    console.log(`  Created user: ${userId}`);
  }

  // ── 3. Create profile ──
  console.log('\n3. Upserting profile...');
  await supabase.from('profiles').upsert({
    id: userId,
    full_name: 'Utilizador Demo',
    role: 'editor',
  });

  // ── 4. Create club membership ──
  console.log('\n4. Creating membership...');
  const { data: existingMembership } = await supabase
    .from('club_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle();

  if (!existingMembership) {
    await supabase.from('club_memberships').insert({
      user_id: userId,
      club_id: clubId,
      role: 'editor',
    });
    console.log('  Membership created');
  } else {
    console.log('  Membership already exists');
  }

  // ── 5. Create age groups for demo club ──
  // IMPORTANT: Demo must have its OWN age groups — requires migration 063
  // (club-scoped unique constraint) to be run first.
  console.log('\n5. Creating age groups...');
  const escaloes = [
    { name: 'Sub-13', gen: endYear - 13 },
    { name: 'Sub-14', gen: endYear - 14 },
    { name: 'Sub-15', gen: endYear - 15 },
  ];

  // Delete existing demo age groups (safe — cascade handles dependents)
  await supabase.from('age_groups').delete().eq('club_id', clubId);

  const { data: ageGroupRows, error: agErr } = await supabase
    .from('age_groups')
    .insert(escaloes.map(e => ({ club_id: clubId, name: e.name, generation_year: e.gen, season })))
    .select('id, name, generation_year');

  if (agErr) throw new Error(`Failed to create age groups: ${agErr.message}`);
  console.log(`  Created ${ageGroupRows!.length} age groups`);

  // ── 6. Clean up existing demo data (for idempotent re-runs) ──
  console.log('\n6. Cleaning up existing demo data...');
  // Delete in dependency order: squad_players → squads → observation_notes → players
  await supabase.from('squad_players').delete().eq('club_id', clubId);
  await supabase.from('squads').delete().eq('club_id', clubId);
  await supabase.from('observation_notes').delete().eq('club_id', clubId);
  await supabase.from('status_history').delete().eq('club_id', clubId);
  await supabase.from('calendar_events').delete().eq('club_id', clubId);
  await supabase.from('players').delete().eq('club_id', clubId);
  console.log('  Cleaned up');

  // ── 7. Insert players per age group ──
  console.log('\n7. Inserting players...');
  const allPlayerIds: { id: number; ageGroupId: string; position: PositionCode }[] = [];

  for (const ag of ageGroupRows!) {
    const demoPlayers = generatePlayers(ag.generation_year, 18);

    const rows = demoPlayers.map(p => ({
      club_id: clubId,
      age_group_id: ag.id,
      name: p.name,
      dob: p.dob,
      club: p.club,
      position_normalized: p.position_normalized,
      secondary_position: p.secondary_position,
      foot: p.foot,
      department_opinion: p.department_opinion,
      recruitment_status: p.recruitment_status,
      zz_height: p.zz_height,
      zz_weight: p.zz_weight,
      created_by: userId,
    }));

    const { data: inserted, error: pErr } = await supabase
      .from('players')
      .insert(rows)
      .select('id, position_normalized');

    if (pErr) throw new Error(`Failed to insert players for ${ag.name}: ${pErr.message}`);

    for (const p of inserted!) {
      allPlayerIds.push({ id: p.id, ageGroupId: ag.id, position: p.position_normalized });
    }

    console.log(`  ${ag.name}: ${inserted!.length} players`);
  }

  // ── 8. Create squads (1 real + 1 shadow per age group) ──
  console.log('\n8. Creating squads...');
  for (const ag of ageGroupRows!) {
    const agPlayers = allPlayerIds.filter(p => p.ageGroupId === ag.id);

    // Create real + shadow squads
    const { data: squads, error: sqErr } = await supabase
      .from('squads')
      .insert([
        { club_id: clubId, name: `${ag.name} — Plantel Real`, squad_type: 'real', age_group_id: ag.id, is_default: true },
        { club_id: clubId, name: `${ag.name} — Plantel Sombra`, squad_type: 'shadow', age_group_id: ag.id, is_default: true },
      ])
      .select('id, squad_type');

    if (sqErr) throw new Error(`Failed to create squads for ${ag.name}: ${sqErr.message}`);

    const realSquad = squads!.find(s => s.squad_type === 'real')!;
    const shadowSquad = squads!.find(s => s.squad_type === 'shadow')!;

    // Assign first 8 players to real squad, next 8 to shadow
    const realPlayers = agPlayers.slice(0, 8);
    const shadowPlayers = agPlayers.slice(8, 16);

    const squadPlayerRows = [
      ...realPlayers.map((p, i) => ({
        squad_id: realSquad.id,
        player_id: p.id,
        club_id: clubId,
        position: p.position,
        sort_order: i,
      })),
      ...shadowPlayers.map((p, i) => ({
        squad_id: shadowSquad.id,
        player_id: p.id,
        club_id: clubId,
        position: p.position,
        sort_order: i,
      })),
    ];

    if (squadPlayerRows.length > 0) {
      const { error: spErr } = await supabase.from('squad_players').insert(squadPlayerRows);
      if (spErr) throw new Error(`Failed to assign squad players for ${ag.name}: ${spErr.message}`);
    }

    // Also set legacy boolean flags for backward compat
    const realIds = realPlayers.map(p => p.id);
    const shadowIds = shadowPlayers.map(p => p.id);

    if (realIds.length > 0) {
      await supabase.from('players').update({ is_real_squad: true }).in('id', realIds);
    }
    if (shadowIds.length > 0) {
      await supabase.from('players').update({ is_shadow_squad: true }).in('id', shadowIds);
      // Set shadow_position for each
      for (const p of shadowPlayers) {
        await supabase.from('players').update({ shadow_position: p.position }).eq('id', p.id);
      }
    }

    console.log(`  ${ag.name}: real=${realPlayers.length}, shadow=${shadowPlayers.length}`);
  }

  // ── 9. Insert observation notes ──
  console.log('\n9. Creating observation notes...');
  const notePlayers = pickN(allPlayerIds, 20);
  const noteRows = notePlayers.map(p => ({
    club_id: clubId,
    player_id: p.id,
    author_id: userId,
    content: pick(NOTE_TEMPLATES),
    priority: pick(['normal', 'normal', 'normal', 'importante', 'urgente'] as const),
  }));

  const { error: nErr } = await supabase.from('observation_notes').insert(noteRows);
  if (nErr) console.warn(`  Warning: notes insert failed: ${nErr.message}`);
  else console.log(`  Created ${noteRows.length} notes`);

  // ── 10. Insert calendar events ──
  console.log('\n10. Creating calendar events...');
  const now = new Date();
  // Calendar uses event_date (DATE) + event_time (TIME), not start_date/end_date
  const futureDate = (daysFromNow: number) => {
    const d = new Date(now.getTime() + daysFromNow * 86400000);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const calendarRows = [
    {
      club_id: clubId,
      title: 'Torneio Sub-14 — Braga',
      event_type: 'observacao',
      event_date: futureDate(3),
      event_time: '10:00',
      location: 'Complexo Desportivo de Braga',
      created_by: userId,
    },
    {
      club_id: clubId,
      title: 'Treino de avaliação',
      event_type: 'treino',
      event_date: futureDate(5),
      event_time: '17:30',
      location: 'Campo do Bessa',
      created_by: userId,
    },
    {
      club_id: clubId,
      title: 'Reunião pais — jogador Sub-15',
      event_type: 'reuniao',
      event_date: futureDate(7),
      event_time: '14:00',
      location: 'Sede do clube',
      created_by: userId,
    },
  ];

  const { error: cErr } = await supabase.from('calendar_events').insert(calendarRows);
  if (cErr) console.warn(`  Warning: calendar insert failed: ${cErr.message}`);
  else console.log(`  Created ${calendarRows.length} events`);

  // ── Done ──
  console.log('\n✅ Demo seed complete!');
  console.log(`  Club: ${DEMO_CLUB_NAME} (${clubId})`);
  console.log(`  User: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Players: ${allPlayerIds.length}`);
  console.log(`  Age groups: ${ageGroupRows!.length}`);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
