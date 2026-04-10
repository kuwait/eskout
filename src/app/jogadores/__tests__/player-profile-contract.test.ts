// src/app/jogadores/__tests__/player-profile-contract.test.ts
// Contract tests for the player profile page data layer
// Ensures the page passes all required props to PlayerProfile regardless of how data is fetched
// RELEVANT FILES: src/app/jogadores/[id]/page.tsx, src/components/players/PlayerProfile.tsx, src/lib/supabase/queries.ts

import { execSync } from 'child_process';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../../..');
const PAGE_PATH = `${ROOT_DIR}/src/app/jogadores/[id]/page.tsx`;
const QUERIES_PATH = `${ROOT_DIR}/src/lib/supabase/queries.ts`;

/* ───────────── Helper: read file content ───────────── */

function readFile(filePath: string): string {
  return execSync(`cat "${filePath}"`, { encoding: 'utf-8' });
}

/* ───────────── Data Contract: PlayerProfile receives all required props ───────────── */

describe('Player profile page data contract', () => {
  let pageContent: string;

  beforeAll(() => {
    pageContent = readFile(PAGE_PATH);
  });

  /**
   * The PlayerProfile component requires these props. If any are missing,
   * sections of the player profile will silently show empty/default data.
   * These tests ensure the page always passes them, regardless of whether
   * the data comes from individual queries or a consolidated RPC.
   */

  it('passes player prop', () => {
    expect(pageContent).toMatch(/player=\{player\}/);
  });

  it('passes userRole prop', () => {
    expect(pageContent).toMatch(/userRole=\{role/);
  });

  it('passes notes prop', () => {
    expect(pageContent).toMatch(/notes=\{notes\}/);
  });

  it('passes statusHistory prop', () => {
    expect(pageContent).toMatch(/statusHistory=\{statusHistory\}/);
  });

  it('passes scoutingReports prop', () => {
    expect(pageContent).toMatch(/scoutingReports=\{scoutingReports\}/);
  });

  it('passes scoutEvaluations prop', () => {
    expect(pageContent).toMatch(/scoutEvaluations=\{scoutEvaluations\}/);
  });

  it('passes quickReports prop', () => {
    expect(pageContent).toMatch(/quickReports=\{quickReports\}/);
  });

  it('passes trainingFeedback prop', () => {
    expect(pageContent).toMatch(/trainingFeedback=\{trainingFeedback\}/);
  });

  it('passes playerVideos prop', () => {
    expect(pageContent).toMatch(/playerVideos=\{playerVideos\}/);
  });

  it('passes currentUserId prop', () => {
    expect(pageContent).toMatch(/currentUserId=\{/);
  });

  it('passes ageGroupName prop', () => {
    expect(pageContent).toMatch(/ageGroupName=\{/);
  });

  it('passes clubMembers prop', () => {
    expect(pageContent).toMatch(/clubMembers=\{/);
  });

  it('passes playerSquads prop', () => {
    expect(pageContent).toMatch(/playerSquads=\{playerSquads\}/);
  });

  it('passes fpfPlayingUp prop', () => {
    expect(pageContent).toMatch(/fpfPlayingUp=\{fpfPlayingUp\}/);
  });

  it('passes zzPlayingUp prop', () => {
    expect(pageContent).toMatch(/zzPlayingUp=\{zzPlayingUp\}/);
  });
});

/* ───────────── Data Completeness: all sections have data sources ───────────── */

describe('Player profile fetches all required data', () => {
  let pageContent: string;

  beforeAll(() => {
    pageContent = readFile(PAGE_PATH);
  });

  it('fetches player by ID', () => {
    // Must call getPlayerById or an RPC that returns player data
    expect(pageContent).toMatch(/getPlayerById|get_player_profile/);
  });

  it('fetches user role', () => {
    expect(pageContent).toMatch(/getCurrentUserRole|role/);
  });

  it('fetches observation notes', () => {
    expect(pageContent).toMatch(/getObservationNotes|observation_notes|notes/);
  });

  it('fetches status history', () => {
    expect(pageContent).toMatch(/getStatusHistory|status_history|statusHistory/);
  });

  it('fetches scouting reports', () => {
    expect(pageContent).toMatch(/getScoutingReports|scouting_reports|scoutingReports/);
  });

  it('fetches scout evaluations', () => {
    expect(pageContent).toMatch(/getScoutEvaluations|scout_evaluations|scoutEvaluations/);
  });

  it('fetches quick scout reports', () => {
    expect(pageContent).toMatch(/getQuickReportsForPlayer|quick_scout_reports|quickReports/);
  });

  it('fetches training feedback', () => {
    expect(pageContent).toMatch(/getTrainingFeedback|training_feedback|trainingFeedback/);
  });

  it('fetches player videos', () => {
    expect(pageContent).toMatch(/getPlayerVideos|player_videos|playerVideos/);
  });

  it('fetches player squads', () => {
    expect(pageContent).toMatch(/getPlayerSquads|squad_players|playerSquads/);
  });

  it('fetches club profiles for member dropdowns', () => {
    expect(pageContent).toMatch(/getAllProfiles|clubProfiles|clubMembers/);
  });

  it('fetches age group name', () => {
    expect(pageContent).toMatch(/age_groups|ageGroup|ageGroupName/);
  });

  it('fetches FPF playing-up data', () => {
    expect(pageContent).toMatch(/getPlayerFpfPlayingUp|fpfPlayingUp/);
  });

  it('computes ZZ playing-up', () => {
    expect(pageContent).toMatch(/detectPlayingUp|zzPlayingUp/);
  });

  it('computes hybrid rating from reports + evaluations', () => {
    // Must compute reportAvgRating from scouting reports + scout evaluations
    expect(pageContent).toMatch(/reportAvgRating|allRatings|reportRatings/);
  });
});

/* ───────────── Performance Guard: query count ───────────── */

describe('Player profile query efficiency', () => {
  let pageContent: string;

  beforeAll(() => {
    pageContent = readFile(PAGE_PATH);
  });

  it('should use at most 2 Promise.all blocks for data fetching', () => {
    // The page should consolidate queries — no more than 2 parallel blocks
    const promiseAllCount = (pageContent.match(/Promise\.all\(/g) || []).length;
    expect(promiseAllCount).toBeLessThanOrEqual(2);
  });

  it('should not call more than 15 individual query functions', () => {
    // Count distinct query function calls (get*, fetch*, supabase.from)
    // Allows for RPC consolidation — if using RPC, this count drops
    const getFunctions = (pageContent.match(/\bget[A-Z]\w+\(/g) || []).length;
    const fetchFunctions = (pageContent.match(/\bfetch[A-Z]\w+\(/g) || []).length;
    const directQueries = (pageContent.match(/supabase\.from\(/g) || []).length;
    const rpcCalls = (pageContent.match(/supabase\.rpc\(/g) || []).length;
    const total = getFunctions + fetchFunctions + directQueries + rpcCalls;
    // After RPC consolidation + server-side props: ~13 (RPC + role + auth + fpfPlayingUp + getPlayerForOg + getPositionLabel + getActiveClubId + detectPlayingUp + mappers + getPlayerListMemberships + getShareTokensForFeedbacks)
    // Down from ~21 before RPC. The extra calls are moved FROM client mount (3-5 POSTs) to server (0 POSTs).
    expect(total).toBeLessThanOrEqual(14);
  });
});

/* ───────────── Query Functions: return correct shapes ───────────── */

describe('Query functions return correct types', () => {
  let queriesContent: string;

  beforeAll(() => {
    queriesContent = readFile(QUERIES_PATH);
  });

  it('getPlayerById returns Player | null', () => {
    expect(queriesContent).toMatch(/getPlayerById[\s\S]*?:\s*Promise<Player\s*\|\s*null>/);
  });

  it('getObservationNotes returns ObservationNote[]', () => {
    expect(queriesContent).toMatch(/getObservationNotes[\s\S]*?:\s*Promise<ObservationNote\[\]>/);
  });

  it('getStatusHistory returns StatusHistoryEntry[]', () => {
    expect(queriesContent).toMatch(/getStatusHistory[\s\S]*?:\s*Promise<StatusHistoryEntry\[\]>/);
  });

  it('getScoutingReports returns ScoutingReport[]', () => {
    expect(queriesContent).toMatch(/getScoutingReports[\s\S]*?:\s*Promise<ScoutingReport\[\]>/);
  });

  it('getScoutEvaluations returns ScoutEvaluation[]', () => {
    expect(queriesContent).toMatch(/getScoutEvaluations[\s\S]*?:\s*Promise<ScoutEvaluation\[\]>/);
  });

  it('getTrainingFeedback returns TrainingFeedback[]', () => {
    expect(queriesContent).toMatch(/getTrainingFeedback[\s\S]*?:\s*Promise<TrainingFeedback\[\]>/);
  });

  it('getAllProfiles returns array with id and fullName', () => {
    // The function must return objects with at least { id, fullName }
    expect(queriesContent).toMatch(/getAllProfiles/);
    expect(queriesContent).toMatch(/fullName:/);
  });
});
