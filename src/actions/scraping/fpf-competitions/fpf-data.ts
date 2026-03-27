// src/actions/scraping/fpf-competitions/fpf-data.ts
// Static FPF data: associations, national competitions, and browse types
// Separated from browse.ts because 'use server' files can only export async functions
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse.ts, src/lib/constants.ts

/* ───────────── Browse by Date Types ───────────── */

/** A single match from the FPF daily results page (live browse, not DB) */
export interface FpfBrowseMatch {
  /** Composite dedup key: `${homeTeam}|${awayTeam}|${date}|${time}` */
  key: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;        // YYYY-MM-DD
  matchTime: string | null; // HH:mm
  venue: string | null;
  competitionName: string;
  seriesName: string | null;
  escalao: string | null;
  fpfMatchId: number | null; // Only set for played matches (past)
  jornada: string | null;    // "Jornada 12", "12.ª Jornada"
}

/** A competition block from the FPF daily results page */
export interface FpfBrowseCompetition {
  name: string;
  competitionId: number | null;
  jornada: string | null;
  series: { name: string | null; matches: FpfBrowseMatch[] }[];
}

/** FootballClassId → label for filter chips in the browse UI.
 *  FPF uses broad category names; district associations may have additional ones.
 *  IDs sourced from FPF_CLASS_TO_ESCALAO in constants.ts. */
export const FPF_FOOTBALL_CLASSES = [
  { id: 10, label: 'Sub-7' },
  { id: 9, label: 'Sub-9' },
  { id: 8, label: 'Sub-11' },
  { id: 6, label: 'Sub-13' },
  { id: 5, label: 'Sub-15' },
  { id: 4, label: 'Sub-17' },
  { id: 3, label: 'Sub-19' },
  { id: 2, label: 'Sénior' },
] as const;

/* ───────────── Competition Scraping Types ───────────── */

export interface FpfAssociation {
  id: number;
  name: string;
}

export interface FpfCompetitionBrowse {
  id: number;
  name: string;
  url: string;
}

export interface FpfFixtureInfo {
  fixtureId: number;
  name: string;
  phaseName: string;
  seriesName: string;
}

export interface FpfFixtureMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string | null;
  time: string | null;
  isPlayed: boolean;
}

/* ───────────── Associations ───────────── */

/** Hardcoded list of Portuguese football associations — IDs from resultados.fpf.pt/Competition */
export const FPF_ASSOCIATIONS: FpfAssociation[] = [
  { id: 224, name: 'AF Algarve' },
  { id: 216, name: 'AF Angra do Heroísmo' },
  { id: 217, name: 'AF Aveiro' },
  { id: 218, name: 'AF Beja' },
  { id: 219, name: 'AF Braga' },
  { id: 220, name: 'AF Bragança' },
  { id: 221, name: 'AF Castelo Branco' },
  { id: 222, name: 'AF Coimbra' },
  { id: 223, name: 'AF Évora' },
  { id: 226, name: 'AF Guarda' },
  { id: 227, name: 'AF Horta' },
  { id: 228, name: 'AF Leiria' },
  { id: 229, name: 'AF Lisboa' },
  { id: 225, name: 'AF Madeira' },
  { id: 230, name: 'AF Ponta Delgada' },
  { id: 231, name: 'AF Portalegre' },
  { id: 232, name: 'AF Porto' },
  { id: 233, name: 'AF Santarém' },
  { id: 234, name: 'AF Setúbal' },
  { id: 235, name: 'AF Viana do Castelo' },
  { id: 236, name: 'AF Vila Real' },
  { id: 237, name: 'AF Viseu' },
];

/** National youth competitions — IDs for 2025/26 season (seasonId=105) */
export const FPF_NATIONAL_YOUTH_COMPETITIONS: { id: number; name: string; classId: number }[] = [
  { id: 27882, name: 'Campeonato Nacional Sub-19 I Divisão', classId: 3 },
  { id: 28132, name: 'Campeonato Nacional Sub-19 II Divisão', classId: 3 },
  { id: 27962, name: 'Campeonato Nacional Sub-17 I Divisão', classId: 4 },
  { id: 28141, name: 'Campeonato Nacional Sub-17 II Divisão', classId: 4 },
  { id: 28015, name: 'Campeonato Nacional Sub-15 I Divisão', classId: 5 },
  { id: 28230, name: 'Campeonato Nacional Sub-15 II Divisão', classId: 5 },
];
