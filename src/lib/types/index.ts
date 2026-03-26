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
  | 'Assinar'
  | 'Ver em treino'
  | 'Stand-by';

export type ObserverEval = '' | '2 - Dúvida' | '3 - Bom' | '4 - Muito Bom' | '5 - Excelente';
export type ObserverDecision = '' | 'Assinar' | 'Acompanhar' | 'Rever' | 'Sem Interesse';

export type RecruitmentStatus =
  | 'por_tratar'
  | 'em_contacto'
  | 'vir_treinar'
  | 'reuniao_marcada'
  | 'a_decidir'
  | 'em_standby'
  | 'confirmado'
  | 'assinou'
  | 'rejeitado';

export type DecisionSide = 'club' | 'player';

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
  decisionSide: DecisionSide | null;
  decisionDate: string | null;
  standbyReason: string | null;
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
  /** Playing up: computed from ZZ team history and/or FPF data. Set by server or client. */
  playingUpRegular?: boolean;
  /** Playing up (pontual): played above but not regularly */
  playingUpPontual?: boolean;
  /** Squad-context only: player is marked as "Dúvida" in the current squad view */
  isDoubt?: boolean;
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
  decision_side: string | null;
  decision_date: string | null;
  standby_reason: string | null;
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
  authorId: string | null;
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

/* ───────────── Contact Purposes ───────────── */

export interface ContactPurpose {
  id: string;
  clubId: string;
  label: string;
  sortOrder: number;
  isArchived: boolean;
}

export interface ContactPurposeRow {
  id: string;
  club_id: string;
  label: string;
  sort_order: number;
  is_archived: boolean;
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
  /** Contact purpose ID (structured option from contact_purposes table) */
  contactPurposeId: string | null;
  /** Free-text purpose when "Outro" was selected */
  contactPurposeCustom: string | null;
  /** Resolved label from contact_purposes join (not stored, computed) */
  contactPurposeLabel?: string;
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

/* ───────────── Quick Scout Reports ───────────── */

export type QuickReportRecommendation = 'Assinar' | 'Acompanhar' | 'Sem interesse';
export type QuickReportMaturation = 'Atrasado' | 'Normal' | 'Avançado';
export type QuickReportFoot = 'Direito' | 'Esquerdo' | 'Ambos';
export type QuickReportStandout = 'Acima' | 'Ao nível' | 'Abaixo';
export type QuickReportStarter = 'Titular' | 'Suplente';
export type QuickReportHeight = 'Baixo' | 'Médio' | 'Alto';
export type QuickReportBuild = 'Magro' | 'Normal' | 'Robusto';
export type QuickReportOpponentLevel = 'Forte' | 'Médio' | 'Fraco';

export interface QuickScoutReport {
  id: number;
  clubId: string;
  playerId: number;
  authorId: string;
  authorName: string;
  ratingTecnica: number;
  ratingTatica: number;
  ratingFisico: number;
  ratingMentalidade: number;
  ratingPotencial: number;
  ratingOverall: number;
  recommendation: QuickReportRecommendation;
  tagsTecnica: string[];
  tagsTatica: string[];
  tagsFisico: string[];
  tagsMentalidade: string[];
  tagsPotencial: string[];
  maturation: QuickReportMaturation | null;
  observedFoot: QuickReportFoot | null;
  heightImpression: QuickReportHeight | null;
  buildImpression: QuickReportBuild | null;
  opponentLevel: QuickReportOpponentLevel | null;
  observedPosition: string | null;
  minutesObserved: number | null;
  standoutLevel: QuickReportStandout | null;
  starter: QuickReportStarter | null;
  subMinute: number | null;
  conditions: string[];
  competition: string | null;
  opponent: string | null;
  matchDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
  /** Escalão where the player will train (from pipeline training_escalao) */
  playerTrainingEscalao: string | null;
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
    training_escalao: string | null;
  } | null;
}

/* ───────────── Training Feedback ───────────── */

export type TrainingPresence = 'attended' | 'missed' | 'rescheduled';
export type TrainingDecision = 'assinar' | 'repetir' | 'descartar' | 'sem_decisao';
export type HeightScale = 'alto' | 'normal' | 'baixo';
export type BuildScale = 'ectomorfo' | 'mesomorfo' | 'endomorfo';
export type SpeedScale = 'rapido' | 'normal' | 'lento';
export type IntensityScale = 'intenso' | 'pouco_intenso';
export type MaturationScale = 'nada_maturado' | 'a_iniciar' | 'maturado' | 'super_maturado';

export interface TrainingFeedback {
  id: number;
  clubId: string;
  playerId: number;
  authorId: string;
  authorName: string;
  trainingDate: string;
  escalao: string | null;
  presence: TrainingPresence;
  feedback: string | null;
  rating: number | null;
  ratingPerformance: number | null;
  ratingPotential: number | null;
  decision: TrainingDecision;
  heightScale: HeightScale | null;
  buildScale: BuildScale | null;
  speedScale: SpeedScale | null;
  intensityScale: IntensityScale | null;
  maturation: MaturationScale | null;
  tags: string[];
  /** Coach feedback (external, via share link) */
  coachFeedback: string | null;
  coachRating: number | null;
  coachRatingPerformance: number | null;
  coachRatingPotential: number | null;
  coachDecision: TrainingDecision | null;
  coachHeightScale: HeightScale | null;
  coachBuildScale: BuildScale | null;
  coachSpeedScale: SpeedScale | null;
  coachIntensityScale: IntensityScale | null;
  coachMaturation: MaturationScale | null;
  coachTags: string[];
  coachName: string | null;
  coachSubmittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingFeedbackRow {
  id: number;
  club_id: string;
  player_id: number;
  author_id: string;
  training_date: string;
  escalao: string | null;
  presence: string;
  feedback: string | null;
  rating: number | null;
  rating_performance: number | null;
  rating_potential: number | null;
  decision: string;
  height_scale: string | null;
  build_scale: string | null;
  speed_scale: string | null;
  intensity_scale: string | null;
  maturation: string | null;
  tags: string[] | null;
  coach_feedback: string | null;
  coach_rating: number | null;
  coach_rating_performance: number | null;
  coach_rating_potential: number | null;
  coach_decision: string | null;
  coach_height_scale: string | null;
  coach_build_scale: string | null;
  coach_speed_scale: string | null;
  coach_intensity_scale: string | null;
  coach_maturation: string | null;
  coach_tags: string[] | null;
  coach_name: string | null;
  coach_submitted_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string } | null;
}

/* ───────────── Feedback Share Token ───────────── */

export interface FeedbackShareToken {
  id: number;
  clubId: string;
  feedbackId: number;
  token: string;
  createdBy: string;
  coachName: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/* ───────────── Player Videos ───────────── */

export interface PlayerVideo {
  id: number;
  clubId: string;
  playerId: number;
  url: string;
  videoId: string;
  title: string | null;
  thumbnail: string | null;
  note: string | null;
  addedBy: string;
  createdAt: string;
}

export interface PlayerVideoRow {
  id: number;
  club_id: string;
  player_id: number;
  url: string;
  video_id: string;
  title: string | null;
  thumbnail: string | null;
  note: string | null;
  added_by: string;
  created_at: string;
}

/* ───────────── Player Lists ───────────── */

export interface PlayerList {
  id: number;
  clubId: string;
  userId: string;
  name: string;
  emoji: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  /** Number of players in this list */
  itemCount: number;
  /** Most recent addition date (null if empty) */
  lastAddedAt: string | null;
  /** Owner name — only present in admin "view all" or shared lists */
  ownerName?: string;
  /** True if the current user is a shared collaborator (not the owner) */
  isSharedWithMe?: boolean;
  /** Users this list is shared with */
  sharedWith?: PlayerListShare[];
}

export interface PlayerListShare {
  id: number;
  listId: number;
  userId: string;
  userName: string;
  sharedBy: string;
  createdAt: string;
}

export interface PlayerListRow {
  id: number;
  club_id: string;
  user_id: string;
  name: string;
  emoji: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlayerListItem {
  id: number;
  listId: number;
  playerId: number;
  playerName: string;
  playerClub: string;
  playerClubLogoUrl: string | null;
  playerPosition: string | null;
  playerDob: string;
  playerNationality: string | null;
  playerPhotoUrl: string | null;
  note: string | null;
  sortOrder: number;
  addedAt: string;
  seenAt: string | null;
}

export interface PlayerListItemRow {
  id: number;
  list_id: number;
  player_id: number;
  note: string | null;
  sort_order: number;
  added_at: string;
  seen_at: string | null;
  players?: {
    name: string;
    club: string | null;
    club_logo_url: string | null;
    position_normalized: string | null;
    dob: string | null;
    nationality: string | null;
    photo_url: string | null;
    zz_photo_url: string | null;
  } | null;
}

/* ───────────── Saved Comparisons ───────────── */

export interface SavedComparison {
  id: number;
  clubId: string;
  userId: string;
  name: string;
  playerIds: number[];
  createdAt: string;
  /** Player names resolved for display (not stored in DB) */
  playerNames?: string[];
}

export interface SavedComparisonRow {
  id: number;
  club_id: string;
  user_id: string;
  name: string;
  player_ids: number[];
  created_at: string;
}

/* ───────────── Picker Player (lightweight for search dialogs) ───────────── */

export interface PickerPlayer {
  id: number;
  name: string;
  club: string;
  clubLogoUrl: string | null;
  positionNormalized: string | null;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  dob: string | null;
  foot: string;
  departmentOpinion: string[];
  nationality: string | null;
}

/* ───────────── Squads (custom squads system) ───────────── */

export type SquadType = 'real' | 'shadow';

export interface Squad {
  id: number;
  clubId: string;
  name: string;
  description: string | null;
  squadType: SquadType;
  ageGroupId: number | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  /** Number of players in this squad (populated by query, not stored) */
  playerCount?: number;
}

export interface SquadRow {
  id: number;
  club_id: string;
  name: string;
  description: string | null;
  squad_type: string;
  age_group_id: number | null;
  sort_order?: number;
  created_by: string | null;
  created_at: string;
}

export interface SquadPlayer {
  id: number;
  squadId: number;
  playerId: number;
  clubId: string;
  position: string;
  sortOrder: number;
  isDoubt: boolean;
  addedAt: string;
}

export interface SquadPlayerRow {
  id: number;
  squad_id: number;
  player_id: number;
  club_id: string;
  position: string;
  sort_order: number;
  is_doubt: boolean;
  added_at: string;
}

/** Squad with its players joined (for squad detail view) */
export interface SquadWithPlayers extends Squad {
  players: (SquadPlayer & {
    player: Player;
  })[];
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

/* ───────────── FPF Competition Scraping ───────────── */

export type FpfCompetitionScrapeStatus = 'pending' | 'scraping' | 'partial' | 'complete' | 'error';

export interface FpfCompetitionRow {
  id: number;
  fpf_competition_id: number;
  fpf_season_id: number;
  name: string;
  association_name: string | null;
  association_id: number | null;
  class_id: number | null;
  escalao: string | null;
  season: string;
  expected_birth_year_start: number | null;
  expected_birth_year_end: number | null;
  match_duration_minutes: number;
  total_fixtures: number;
  total_matches: number;
  scraped_matches: number;
  total_series: number;
  total_teams: number;
  total_players: number;
  linked_players: number;
  unlinked_players: number;
  last_scraped_at: string | null;
  scrape_status: FpfCompetitionScrapeStatus;
  scrape_error: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FpfCompetition {
  id: number;
  fpfCompetitionId: number;
  fpfSeasonId: number;
  name: string;
  associationName: string | null;
  associationId: number | null;
  classId: number | null;
  escalao: string | null;
  season: string;
  expectedBirthYearStart: number | null;
  expectedBirthYearEnd: number | null;
  matchDurationMinutes: number;
  totalFixtures: number;
  totalMatches: number;
  scrapedMatches: number;
  lastScrapedAt: string | null;
  scrapeStatus: FpfCompetitionScrapeStatus;
  scrapeError: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface FpfMatchRow {
  id: number;
  competition_id: number;
  fpf_match_id: number;
  fpf_fixture_id: number;
  fixture_name: string | null;
  phase_name: string | null;
  series_name: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string | null;
  match_time: string | null;
  venue: string | null;
  referee: string | null;
  is_forfeit: boolean;
  has_lineup_data: boolean;
  scraped_at: string;
}

export interface FpfMatch {
  id: number;
  competitionId: number;
  fpfMatchId: number;
  fpfFixtureId: number;
  fixtureName: string | null;
  phaseName: string | null;
  seriesName: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  matchDate: string | null;
  matchTime: string | null;
  venue: string | null;
  referee: string | null;
  isForfeit: boolean;
  hasLineupData: boolean;
  scrapedAt: string;
}

export type FpfMatchEventType = 'goal' | 'penalty_goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution_in' | 'substitution_out';

export interface FpfMatchPlayerRow {
  id: number;
  match_id: number;
  fpf_player_id: number | null;
  player_name: string;
  shirt_number: number | null;
  team_name: string;
  is_starter: boolean;
  is_substitute: boolean;
  subbed_in_minute: number | null;
  subbed_out_minute: number | null;
  minutes_played: number | null;
  goals: number;
  penalty_goals: number;
  own_goals: number;
  yellow_cards: number;
  red_cards: number;
  red_card_minute: number | null;
  eskout_player_id: number | null;
}

export interface FpfMatchPlayer {
  id: number;
  matchId: number;
  fpfPlayerId: number | null;
  playerName: string;
  shirtNumber: number | null;
  teamName: string;
  isStarter: boolean;
  isSubstitute: boolean;
  subbedInMinute: number | null;
  subbedOutMinute: number | null;
  minutesPlayed: number | null;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  redCardMinute: number | null;
  eskoutPlayerId: number | null;
}

export interface FpfMatchEventRow {
  id: number;
  match_id: number;
  event_type: FpfMatchEventType;
  minute: number | null;
  player_name: string;
  fpf_player_id: number | null;
  team_name: string;
  related_player_name: string | null;
  related_fpf_player_id: number | null;
  notes: string | null;
}

export interface FpfMatchEvent {
  id: number;
  matchId: number;
  eventType: FpfMatchEventType;
  minute: number | null;
  playerName: string;
  fpfPlayerId: number | null;
  teamName: string;
  relatedPlayerName: string | null;
  relatedFpfPlayerId: number | null;
  notes: string | null;
}

/** Aggregated player stats across a competition (computed, not stored) */
export interface FpfPlayerStats {
  fpfPlayerId: number | null;
  playerName: string;
  teamName: string;
  gamesStarted: number;
  gamesAsSub: number;
  totalGames: number;
  totalMinutes: number;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
  eskoutPlayerId: number | null;
  /** "Playing Up" detection */
  playerDob: string | null;
  expectedEscalao: string | null;
  actualEscalao: string | null;
  yearsAbove: number | null;
}
