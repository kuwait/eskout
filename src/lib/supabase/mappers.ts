// src/lib/supabase/mappers.ts
// Row-to-domain mappers for Supabase database rows — safe to import in client components
// Pure functions with no server-side dependencies
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/queries.ts, src/components/players/PlayersView.tsx

import type { CalendarEvent, CalendarEventRow, DepartmentOpinion, Player, PlayerRow } from '@/lib/types';

/** Safely cast department_opinion from DB (could be TEXT[], single string, JSON-encoded, or null) */
function castToOpinionArray(raw: string[] | string | null): DepartmentOpinion[] {
  if (!raw) return [];

  // Already an array from Supabase (TEXT[] column)
  if (Array.isArray(raw)) {
    // Each element might be a JSON-encoded string from a bad migration, e.g. '["1ª Escolha"]'
    return raw.flatMap((item) => {
      if (item.startsWith('[')) {
        try { return JSON.parse(item) as string[]; } catch { /* ignore */ }
      }
      return [item];
    }) as DepartmentOpinion[];
  }

  // Single string — could be JSON array or plain value
  if (raw.startsWith('[')) {
    try { return (JSON.parse(raw) as string[]) as DepartmentOpinion[]; } catch { /* ignore */ }
  }

  return [raw as DepartmentOpinion];
}

/** Map old English recruitment statuses to new Portuguese ones (pre-migration compat) */
const LEGACY_STATUS_MAP: Record<string, string> = {
  pool: '',
  shortlist: 'por_tratar',
  to_observe: 'a_observar',
  target: 'em_contacto',
  in_contact: 'em_contacto',
  negotiating: 'a_decidir',
  confirmed: 'confirmado',
  rejected: 'rejeitado',
};

function mapRecruitmentStatus(raw: string | null): Player['recruitmentStatus'] {
  if (!raw) return null;
  // Check if it's an old English status
  if (raw in LEGACY_STATUS_MAP) {
    const mapped = LEGACY_STATUS_MAP[raw];
    return mapped ? (mapped as Player['recruitmentStatus']) : null;
  }
  return raw as Player['recruitmentStatus'];
}

/** Format shirt number: remove trailing ".0" from numeric strings */
function formatShirtNumber(raw: string | null): string {
  if (!raw) return '';
  // "4.0" → "4", "10.0" → "10", but keep "12A" as-is
  const num = parseFloat(raw);
  if (!isNaN(num) && Number.isFinite(num)) return String(Math.round(num));
  return raw;
}

/** Map a Supabase PlayerRow (snake_case) to the domain Player type (camelCase) */
export function mapPlayerRow(row: PlayerRow): Player {
  return {
    id: row.id,
    ageGroupId: row.age_group_id,
    name: row.name,
    dob: row.dob,
    club: row.club ?? '',
    positionOriginal: row.position_original ?? '',
    positionNormalized: (row.position_normalized as Player['positionNormalized']) ?? '',
    foot: (row.foot as Player['foot']) ?? '',
    shirtNumber: formatShirtNumber(row.shirt_number),
    contact: row.contact ?? '',
    departmentOpinion: castToOpinionArray(row.department_opinion),
    observer: row.observer ?? '',
    observerEval: (row.observer_eval as Player['observerEval']) ?? '',
    observerDecision: (row.observer_decision as Player['observerDecision']) ?? '',
    referredBy: row.referred_by ?? '',
    notes: row.notes ?? '',
    reportLabels: [
      row.report_label_1, row.report_label_2, row.report_label_3,
      row.report_label_4, row.report_label_5, row.report_label_6,
    ].filter(Boolean) as string[],
    reportLinks: [
      row.report_link_1, row.report_link_2, row.report_link_3,
      row.report_link_4, row.report_link_5, row.report_link_6,
    ].filter(Boolean) as string[],
    fpfLink: row.fpf_link ?? '',
    fpfPlayerId: row.fpf_player_id ?? '',
    zerozeroLink: row.zerozero_link ?? '',
    zerozeroPlayerId: row.zerozero_player_id ?? '',
    fpfCurrentClub: row.fpf_current_club,
    fpfLastChecked: row.fpf_last_checked,
    zzCurrentClub: row.zz_current_club,
    zzCurrentTeam: row.zz_current_team,
    zzGamesSeason: row.zz_games_season,
    zzGoalsSeason: row.zz_goals_season,
    zzHeight: row.zz_height,
    zzWeight: row.zz_weight,
    height: row.height ?? null,
    weight: row.weight ?? null,
    birthCountry: row.birth_country ?? null,
    nationality: row.nationality ?? null,
    photoUrl: row.photo_url ?? null,
    zzPhotoUrl: row.zz_photo_url,
    zzTeamHistory: row.zz_team_history,
    zzLastChecked: row.zz_last_checked,
    recruitmentStatus: mapRecruitmentStatus(row.recruitment_status),
    trainingDate: row.training_date,
    meetingDate: row.meeting_date ?? null,
    signingDate: row.signing_date ?? null,
    recruitmentNotes: row.recruitment_notes ?? '',
    isRealSquad: row.is_real_squad,
    isShadowSquad: row.is_shadow_squad,
    shadowPosition: (row.shadow_position as Player['shadowPosition']) ?? null,
    shadowOrder: row.shadow_order ?? 0,
    realOrder: row.real_order ?? 0,
    pipelineOrder: row.pipeline_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ───────────── Calendar Event Mapper ───────────── */

/** Map a Supabase CalendarEventRow (snake_case) to the domain CalendarEvent type (camelCase) */
export function mapCalendarEventRow(row: CalendarEventRow): CalendarEvent {
  // Resolve assignee display name from free-text field
  const resolvedAssigneeName = row.assignee_name || '';

  return {
    id: row.id,
    ageGroupId: row.age_group_id,
    playerId: row.player_id,
    playerName: row.players?.name ?? null,
    playerPhotoUrl: row.players?.photo_url || row.players?.zz_photo_url || null,
    playerClub: row.players?.club ?? null,
    playerPosition: row.players?.position_normalized ?? null,
    playerDob: row.players?.dob ?? null,
    playerFoot: row.players?.foot ?? null,
    eventType: row.event_type as CalendarEvent['eventType'],
    title: row.title,
    eventDate: row.event_date,
    eventTime: row.event_time,
    location: row.location ?? '',
    notes: row.notes ?? '',
    assigneeUserId: row.assignee_user_id,
    assigneeName: resolvedAssigneeName,
    createdBy: row.created_by,
    createdByName: '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
