// src/lib/types/index.ts
// All TypeScript types for the Eskout application
// Central type definitions matching the Supabase schema (SOP 5.5)
// RELEVANT FILES: src/lib/constants.ts, src/lib/validators.ts, src/lib/supabase/server.ts

/* ───────────── Position & Enums ───────────── */

export type PositionCode = 'GR' | 'DD' | 'DE' | 'DC' | 'MDC' | 'MC' | 'MOC' | 'ED' | 'EE' | 'PL';

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

export type UserRole = 'admin' | 'scout';

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
  foot: Foot;
  shirtNumber: string;
  contact: string;
  departmentOpinion: DepartmentOpinion[];
  observer: string;
  observerEval: ObserverEval;
  observerDecision: ObserverDecision;
  referredBy: string;
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
  photoUrl: string | null;
  zzPhotoUrl: string | null;
  zzTeamHistory: { club: string; season: string; games: number; goals: number }[] | null;
  zzLastChecked: string | null;
  recruitmentStatus: RecruitmentStatus | null;
  trainingDate: string | null;
  meetingDate: string | null;
  signingDate: string | null;
  recruitmentNotes: string;
  isRealSquad: boolean;
  isShadowSquad: boolean;
  shadowPosition: string | null;
  shadowOrder: number;
  realOrder: number;
  pipelineOrder: number;
  createdAt: string;
  updatedAt: string;
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
  foot: string | null;
  shirt_number: string | null;
  contact: string | null;
  department_opinion: string[] | string | null;
  observer: string | null;
  observer_eval: string | null;
  observer_decision: string | null;
  referred_by: string | null;
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
  photo_url: string | null;
  zz_photo_url: string | null;
  zz_team_history: { club: string; season: string; games: number; goals: number }[] | null;
  zz_last_checked: string | null;
  recruitment_status: string;
  training_date: string | null;
  meeting_date: string | null;
  signing_date: string | null;
  recruitment_notes: string | null;
  is_real_squad: boolean;
  is_shadow_squad: boolean;
  shadow_position: string | null;
  shadow_order: number;
  real_order: number;
  pipeline_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/* ───────────── Scouting Report ───────────── */

export interface ScoutingReport {
  id: number;
  playerId: number;
  gdriveFileId: string;
  gdriveLink: string;
  reportNumber: number;
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

export interface ObservationNote {
  id: number;
  playerId: number;
  authorId: string;
  authorName: string;
  content: string;
  matchContext: string | null;
  createdAt: string;
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
}

export interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
}

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
