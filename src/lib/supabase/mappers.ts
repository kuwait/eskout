// src/lib/supabase/mappers.ts
// Row-to-domain mappers for Supabase database rows — safe to import in client components
// Pure functions with no server-side dependencies
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/queries.ts, src/components/players/PlayersView.tsx

import type { Player, PlayerRow } from '@/lib/types';

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
    shirtNumber: row.shirt_number ?? '',
    contact: row.contact ?? '',
    departmentOpinion: (row.department_opinion as Player['departmentOpinion']) ?? '',
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
    zzPhotoUrl: row.zz_photo_url,
    zzTeamHistory: row.zz_team_history,
    zzLastChecked: row.zz_last_checked,
    recruitmentStatus: (row.recruitment_status as Player['recruitmentStatus']) ?? 'pool',
    recruitmentNotes: row.recruitment_notes ?? '',
    isRealSquad: row.is_real_squad,
    isShadowSquad: row.is_shadow_squad,
    shadowPosition: (row.shadow_position as Player['shadowPosition']) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
