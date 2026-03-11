// src/lib/types/index.ts
// All TypeScript types for the Eskout application
// Central type definitions matching the Supabase schema (SOP 5.5)
// RELEVANT FILES: src/lib/constants.ts, src/lib/validators.ts, src/lib/supabase/server.ts

/* ───────────── Observation Tier (computed, not stored) ───────────── */

export type ObservationTier = 'observado' | 'referenciado' | 'adicionado';

/* ───────────── Position & Enums ───────────── */

export type PositionCode = 'GR' | 'DD' | 'DE' | 'DC' | 'MDC' | 'MD' | 'MC' | 'ME' | 'MOC' | 'ED' | 'EE' | 'AD' | 'AE' | 'SA' | 'PL';

export type DepartmentOpinion =
  | '1ª Escolha'
  | '2ª Escolha'
  | 'Acompanhar'
  | 'Por Observar'
  | 'Urgente Observar'
  | 'Sem interesse'
  | 'Potencial'
  | 'Assinar';

export type ObserverEval = '' | '2 - Dúvida' | '3 - Bom' | '4 - Muito Bom' | '5 - Excelente';
export type ObserverDecision = '' | 'Assinar' | 'Acompanhar' | 'Rever' | 'Sem Interesse';

export type RecruitmentStatus =
  | 'por_tratar'
  | 'a_observar'
  | 'em_contacto'
  | 'vir_treinar'
  | 'reuniao_marcada'
  | 'a_decidir'
  | 'confirmado'
  | 'assinou'
  | 'rejeitado';

export type UserRole = 'admin' | 'editor' | 'scout' | 'recruiter';

export type Foot = 'Dir' | 'Esq' | 'Amb' | '';

/* ───────────── Player ───────────── */

export interface Player {
  id: number;
  ageGroupId: number;
  name: string;
  dob: string | null;
  club: string;
  positionOriginal: string;
  positionNormalized: string;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  foot: Foot;
  shirtNumber: string;
  contact: string;
  departmentOpinion: DepartmentOpinion[];
  observer: string;
  observerEval: ObserverEval;
  observerDecision: ObserverDecision;
  referredBy: string;
  referredByUserId: string | null;
  notes: string;
  reportLabels: string[];
  reportLinks: string[];
  fpfLink: string;
  fpfPlayerId: string;
  zerozeroLink: string;
  zerozeroPlayerId: string;
  fpfCurrentClub: string | null;
  fpfLastChecked: string | null;
  zzCurrentClub: string | null;
  zzCurrentTeam: string | null;
  zzGamesSeason: number | null;
  zzGoalsSeason: number | null;
  zzHeight: number | null;
  zzWeight: number | null;
  height: number | null;
  weight: number | null;
  birthCountry: string | null;
  nationality: string | null;
  photoUrl: string | null;
  zzPhotoUrl: string | null;
  clubLogoUrl: string | null;
  zzTeamHistory: { club: string; team?: string; season: string; games: number; goals: number }[] | null;
  zzLastChecked: string | null;
  recruitmentStatus: RecruitmentStatus | null;
  trainingDate: string | null;
  meetingDate: string | null;
  signingDate: string | null;
  recruitmentNotes: string;
  contactAssignedTo: string | null;
  contactAssignedToName: string | null;
  meetingAttendees: string[];
  signingAttendees: string[];
  trainingEscalao: string | null;
  isRealSquad: boolean;
  isShadowSquad: boolean;
  realSquadPosition: string | null;
  shadowPosition: string | null;
  shadowOrder: number;
  realOrder: number;
  pipelineOrder: number;
  pendingApproval: boolean;
  adminReviewed: boolean;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Average rating from scouting reports (null if no reports with ratings) */
  reportAvgRating: number | null;
  /** Number of scouting reports that have a rating */
  reportRatingCount: number;
  /** Observation note contents for table preview (newest first) */
  observationNotePreviews: string[];
}

/* ───────────── Database Row Types (snake_case from Supabase) ───────────── */

export interface PlayerRow {
  id: number;
  age_group_id: number;
  name: string;
  dob: string | null;
  club: string | null;
  position_original: string | null;
  position_normalized: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  foot: string | null;
  shirt_number: string | null;
  contact: string | null;
  department_opinion: string[] | string | null;
  observer: string | null;
  observer_eval: string | null;
  observer_decision: string | null;
  referred_by: string | null;
  referred_by_user_id: string | null;
  notes: string | null;
  report_label_1: string | null;
  report_label_2: string | null;
  report_label_3: string | null;
  report_label_4: string | null;
  report_label_5: string | null;
  report_label_6: string | null;
  report_link_1: string | null;
  report_link_2: string | null;
  report_link_3: string | null;
  report_link_4: string | null;
  report_link_5: string | null;
  report_link_6: string | null;
  fpf_link: string | null;
  fpf_player_id: string | null;
  zerozero_link: string | null;
  zerozero_player_id: string | null;
  fpf_current_club: string | null;
  fpf_last_checked: string | null;
  zz_current_club: string | null;
  zz_current_team: string | null;
  zz_games_season: number | null;
  zz_goals_season: number | null;
  zz_height: number | null;
  zz_weight: number | null;
  height: number | null;
  weight: number | null;
  birth_country: string | null;
  nationality: string | null;
  photo_url: string | null;
  zz_photo_url: string | null;
  club_logo_url: string | null;
  zz_team_history: { club: string; team?: string; season: string; games: number; goals: number }[] | null;
  zz_last_checked: string | null;
  recruitment_status: string;
  training_date: string | null;
  meeting_date: string | null;
  signing_date: string | null;
  recruitment_notes: string | null;
  contact_assigned_to: string | null;
  meeting_attendees: string[] | null;
  signing_attendees: string[] | null;
  training_escalao: string | null;
  is_real_squad: boolean;
  is_shadow_squad: boolean;
  real_squad_position: string | null;
  shadow_position: string | null;
  shadow_order: number;
  real_order: number;
  pipeline_order: number;
  pending_approval: boolean;
  admin_reviewed: boolean;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/* ───────────── User Tasks ───────────── */

export type TaskSource = 'manual' | 'pipeline_contact' | 'pipeline_meeting' | 'pipeline_training' | 'pipeline_signing';

export interface UserTask {
  id: number;
  clubId: number;
  userId: string;
  createdBy: string;
  playerId: number | null;
  playerName: string | null;
  playerContact: string | null;
  playerClub: string | null;
  playerMeetingDate: string | null;
  playerSigningDate: string | null;
  playerMeetingAttendees: string[];
  playerSigningAttendees: string[];
  title: string;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  source: TaskSource;
  pinned: boolean;
  createdAt: string;
}

export interface UserTaskRow {
  id: number;
  club_id: number;
  user_id: string;
  created_by: string;
  player_id: number | null;
  title: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  source: string;
  pinned: boolean;
  created_at: string;
  players?: { name: string; contact: string | null; club: string | null; meeting_date: string | null; signing_date: string | null; meeting_attendees: string[] | null; signing_attendees: string[] | null } | null;
}

/* ───────────── Scouting Report ───────────── */

export interface ScoutingReport {
  id: number;
  playerId: number;
  gdriveFileId: string;
  gdriveLink: string;
  reportNumber: number;
  pdfFilename: string;
  competition: string;
  ageGroup: string;
  match: string;
  matchDate: string | null;
  matchResult: string;
  playerNameReport: string;
  shirtNumberReport: string;
  birthYearReport: string;
  footReport: string;
  teamReport: string;
  positionReport: string;
  physicalProfile: string;
  strengths: string;
  weaknesses: string;
  rating: number | null;
  decision: string;
  analysis: string;
  contactInfo: string;
  scoutName: string;
  extractionStatus: 'pending' | 'success' | 'partial' | 'error';
  extractedAt: string | null;
}

/** Raw row shape from scouting_reports table (snake_case) */
export interface ScoutingReportRow {
  id: number;
  player_id: number;
  gdrive_file_id: string;
  gdrive_link: string | null;
  report_number: number | null;
  pdf_filename: string | null;
  competition: string | null;
  age_group: string | null;
  match: string | null;
  match_date: string | null;
  match_result: string | null;
  player_name_report: string | null;
  shirt_number_report: string | null;
  birth_year_report: string | null;
  foot_report: string | null;
  team_report: string | null;
  position_report: string | null;
  physical_profile: string | null;
  strengths: string | null;
  weaknesses: string | null;
  rating: number | null;
  decision: string | null;
  analysis: string | null;
  contact_info: string | null;
  scout_name: string | null;
  raw_text: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extracted_at: string | null;
  created_at: string;
}

/* ───────────── Status History ───────────── */

export interface StatusHistoryEntry {
  id: number;
  playerId: number;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedByName: string;
  notes: string | null;
  createdAt: string;
}

/* ───────────── Observation Notes ───────────── */

export type NotePriority = 'normal' | 'importante' | 'urgente';

export interface ObservationNote {
  id: number;
  playerId: number;
  authorId: string;
  authorName: string;
  content: string;
  matchContext: string | null;
  priority: NotePriority;
  createdAt: string;
}

/* ───────────── Scout Evaluations ───────────── */

export interface ScoutEvaluation {
  id: number;
  playerId: number;
  userId: string;
  userName: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

/* ───────────── Age Group ───────────── */

export interface AgeGroup {
  id: number;
  name: string;
  generationYear: number;
  season: string;
}

export interface AgeGroupRow {
  id: number;
  name: string;
  generation_year: number;
  season: string;
  created_at: string;
}

/* ───────────── Profile ───────────── */

export interface Profile {
  id: string;
  fullName: string;
  role: UserRole;
  isSuperadmin?: boolean;
}

export interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
  is_superadmin?: boolean;
  created_at: string;
}

/* ───────────── Club (Multi-Tenant) ───────────── */

export interface Club {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  features: Record<string, boolean>;
  settings: Record<string, unknown>;
  limits: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClubRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  features: Record<string, boolean>;
  settings: Record<string, unknown>;
  limits: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClubMembership {
  id: string;
  userId: string;
  clubId: string;
  role: UserRole;
  invitedBy: string | null;
  joinedAt: string;
}

export interface ClubMembershipRow {
  id: string;
  user_id: string;
  club_id: string;
  role: string;
  invited_by: string | null;
  joined_at: string;
}

export type ClubRole = UserRole;

/** Feature keys that can be toggled per club */
export type ClubFeatureKey =
  | 'pipeline'
  | 'calendar'
  | 'shadow_squad'
  | 'scouting_reports'
  | 'scout_submissions'
  | 'export'
  | 'positions_view'
  | 'alerts';

/* ───────────── Server Action Response ───────────── */

export interface ActionResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/* ───────────── Calendar Events ───────────── */

export type CalendarEventType = 'treino' | 'assinatura' | 'reuniao' | 'observacao' | 'outro';

export interface CalendarEvent {
  id: number;
  ageGroupId: number | null;
  playerId: number | null;
  playerName: string | null;
  playerPhotoUrl: string | null;
  playerClub: string | null;
  playerPosition: string | null;
  playerDob: string | null;
  playerFoot: string | null;
  eventType: CalendarEventType;
  title: string;
  eventDate: string; // YYYY-MM-DD
  eventTime: string | null; // HH:mm
  location: string;
  notes: string;
  assigneeUserId: string | null;
  assigneeName: string;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** True when this event is derived from a player's pipeline date (training/meeting/signing) — read-only in calendar */
  isPlayerDate?: boolean;
}

export interface CalendarEventRow {
  id: number;
  age_group_id: number | null;
  player_id: number | null;
  event_type: string;
  title: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  notes: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  players?: {
    name: string;
    photo_url: string | null;
    zz_photo_url: string | null;
    club: string | null;
    position_normalized: string | null;
    dob: string | null;
    foot: string | null;
  } | null;
}

/* ───────────── JSON Import Types (data/all_players.json structure) ───────────── */

export interface PlayerJsonImport {
  id: number;
  name: string;
  year: string;
  escalao: string;
  op: string;
  dob: string;
  club: string;
  pos: string;
  pn: string;
  foot: string;
  num: string;
  contact: string;
  ref: string;
  notes: string;
  obs: string;
  eval: string;
  dec: string;
  fpf: string;
  reports: string[];
  reportLinks: { num: number; label: string; link: string }[];
  status: string;
}
