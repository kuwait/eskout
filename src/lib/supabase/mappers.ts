// src/lib/supabase/mappers.ts
// Row-to-domain mappers for Supabase database rows — safe to import in client components
// Pure functions with no server-side dependencies
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/queries.ts, src/components/players/PlayersView.tsx

import type { CalendarEvent, CalendarEventRow, DepartmentOpinion, Player, PlayerRow, ScoutingReport, ScoutingReportRow, Squad, SquadRow, SquadPlayer, SquadPlayerRow, TrainingFeedback, TrainingFeedbackRow, UserTask, UserTaskRow } from '@/lib/types';

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
  to_observe: 'por_tratar',
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

/** Reject relative paths and FPF placeholder images — only accept absolute http(s) URLs */
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!url.startsWith('http')) return false;
  if (url.includes('placeholder')) return false;
  return true;
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
    secondaryPosition: row.secondary_position ?? null,
    tertiaryPosition: row.tertiary_position ?? null,
    foot: (row.foot as Player['foot']) ?? '',
    shirtNumber: formatShirtNumber(row.shirt_number),
    contact: row.contact ?? '',
    departmentOpinion: castToOpinionArray(row.department_opinion),
    observer: row.observer ?? '',
    observerEval: (row.observer_eval as Player['observerEval']) ?? '',
    observerDecision: (row.observer_decision as Player['observerDecision']) ?? '',
    referredBy: row.referred_by ?? '',
    referredByUserId: row.referred_by_user_id ?? null,
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
    photoUrl: isValidImageUrl(row.photo_url) ? row.photo_url : null,
    zzPhotoUrl: isValidImageUrl(row.zz_photo_url) ? row.zz_photo_url : null,
    clubLogoUrl: row.club_logo_url ?? null,
    zzTeamHistory: row.zz_team_history,
    zzLastChecked: row.zz_last_checked,
    recruitmentStatus: mapRecruitmentStatus(row.recruitment_status),
    decisionSide: (row.decision_side as Player['decisionSide']) ?? null,
    trainingDate: row.training_date,
    meetingDate: row.meeting_date ?? null,
    signingDate: row.signing_date ?? null,
    recruitmentNotes: row.recruitment_notes ?? '',
    contactAssignedTo: row.contact_assigned_to ?? null,
    contactAssignedToName: null, // Populated by join query in page
    meetingAttendees: Array.isArray(row.meeting_attendees) ? row.meeting_attendees : [],
    signingAttendees: Array.isArray(row.signing_attendees) ? row.signing_attendees : [],
    trainingEscalao: row.training_escalao ?? null,
    isRealSquad: row.is_real_squad,
    isShadowSquad: row.is_shadow_squad,
    realSquadPosition: (row.real_squad_position as Player['realSquadPosition']) ?? null,
    shadowPosition: (row.shadow_position as Player['shadowPosition']) ?? null,
    shadowOrder: row.shadow_order ?? 0,
    realOrder: row.real_order ?? 0,
    pipelineOrder: row.pipeline_order ?? 0,
    pendingApproval: row.pending_approval ?? false,
    adminReviewed: row.admin_reviewed ?? true,
    approvedBy: row.approved_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Report rating fields — populated later by bulk query, default to empty
    reportAvgRating: null,
    reportRatingCount: 0,
    // Observation notes — populated by PlayersView query
    observationNotePreviews: [],
  };
}

/* ───────────── Scouting Report Mapper ───────────── */

/** Map a Supabase ScoutingReportRow (snake_case) to the domain ScoutingReport type (camelCase) */
export function mapScoutingReportRow(row: ScoutingReportRow): ScoutingReport {
  return {
    id: row.id,
    playerId: row.player_id,
    gdriveFileId: row.gdrive_file_id,
    gdriveLink: row.gdrive_link ?? '',
    reportNumber: row.report_number ?? 0,
    pdfFilename: row.pdf_filename ?? '',
    competition: row.competition ?? '',
    ageGroup: row.age_group ?? '',
    match: row.match ?? '',
    matchDate: row.match_date,
    matchResult: row.match_result ?? '',
    playerNameReport: row.player_name_report ?? '',
    shirtNumberReport: row.shirt_number_report ?? '',
    birthYearReport: row.birth_year_report ?? '',
    footReport: row.foot_report ?? '',
    teamReport: row.team_report ?? '',
    positionReport: row.position_report ?? '',
    physicalProfile: row.physical_profile ?? '',
    strengths: row.strengths ?? '',
    weaknesses: row.weaknesses ?? '',
    rating: row.rating,
    decision: row.decision ?? '',
    analysis: row.analysis ?? '',
    contactInfo: row.contact_info ?? '',
    scoutName: row.scout_name ?? '',
    extractionStatus: (row.extraction_status as ScoutingReport['extractionStatus']) ?? 'pending',
    extractedAt: row.extracted_at,
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
    playerTrainingEscalao: row.players?.training_escalao ?? null,
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

/* ───────────── Training Feedback Mapper ───────────── */

/** Map a Supabase TrainingFeedbackRow (snake_case) to the domain TrainingFeedback type (camelCase) */
export function mapTrainingFeedbackRow(row: TrainingFeedbackRow): TrainingFeedback {
  return {
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: row.profiles?.full_name ?? 'Desconhecido',
    trainingDate: row.training_date,
    escalao: row.escalao,
    presence: row.presence as TrainingFeedback['presence'],
    feedback: row.feedback,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ───────────── Squad Mapper ───────────── */

/** Map a Supabase SquadRow (snake_case) to the domain Squad type (camelCase) */
export function mapSquadRow(row: SquadRow): Squad {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    description: row.description,
    squadType: row.squad_type as Squad['squadType'],
    ageGroupId: row.age_group_id,
    sortOrder: row.sort_order ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Map a Supabase SquadPlayerRow (snake_case) to the domain SquadPlayer type (camelCase) */
export function mapSquadPlayerRow(row: SquadPlayerRow): SquadPlayer {
  return {
    id: row.id,
    squadId: row.squad_id,
    playerId: row.player_id,
    clubId: row.club_id,
    position: row.position,
    sortOrder: row.sort_order,
    addedAt: row.added_at,
  };
}

/* ───────────── User Task Mapper ───────────── */

/** Map a Supabase UserTaskRow (snake_case) to the domain UserTask type (camelCase) */
export function mapUserTaskRow(row: UserTaskRow): UserTask {
  return {
    id: row.id,
    clubId: row.club_id,
    userId: row.user_id,
    createdBy: row.created_by,
    playerId: row.player_id,
    playerName: row.players?.name ?? null,
    playerContact: row.players?.contact ?? null,
    playerClub: row.players?.club ?? null,
    playerMeetingDate: row.players?.meeting_date ?? null,
    playerSigningDate: row.players?.signing_date ?? null,
    playerMeetingAttendees: Array.isArray(row.players?.meeting_attendees) ? row.players.meeting_attendees : [],
    playerSigningAttendees: Array.isArray(row.players?.signing_attendees) ? row.players.signing_attendees : [],
    title: row.title,
    dueDate: row.due_date,
    completed: row.completed,
    completedAt: row.completed_at,
    source: row.source as UserTask['source'],
    pinned: row.pinned,
    createdAt: row.created_at,
  };
}
