// src/lib/zerozero/__tests__/parser.test.ts
// Unit tests for ZeroZero profile HTML parser — career history extraction
// Verifies both rich (micrologo) and simple (cromo cards) HTML layouts are parsed
// RELEVANT FILES: src/lib/zerozero/parser.ts, src/actions/scraping/zerozero.ts

import { parseZzProfileHtml } from '../parser';

/* ───────────── Career History Parsing ───────────── */

describe('parseZzProfileHtml — career history', () => {
  // Minimal HTML with rich layout career table (micrologo_and_text) — only 2025/26
  // Plus cromo_stats cards for older seasons (2024/25, 2023/24, 2022/23)
  // This reproduces the real ZZ page structure for youth players where the career table
  // is paginated ("+14 registos" behind login) but cromo cards show all seasons
  const YOUTH_PLAYER_HTML = `
    <html><body>
    <div class="card-data__title">Resumo 2025/26</div>

    <!-- Cromo cards — one per season, contain club+team but no stats -->
    <div class="zz-tpl-col is-3"><a href="/jogador/test/123?epoca_id=155"><div>
      <div class="cromo_card medium"></div>
      <div class="team_name"><span title="Boavista FC Jun.C S15" style="color:#101010;">Boavista FC Jun.C S15</span></div>
    </div></a><div class="cromo_stats medium"><span class="text"><a href="/jogador/test/123?epoca_id=155">2025/26</a></span></div></div>

    <div class="zz-tpl-col is-3"><a href="/jogador/test/123?epoca_id=154"><div>
      <div class="cromo_card medium"></div>
      <div class="team_name"><span title="Panther Force Jun.B S17" style="color:#101010;">Panther Force Jun.B S17</span></div>
    </div></a><div class="cromo_stats medium"><span class="text"><a href="/jogador/test/123?epoca_id=154">2024/25</a></span></div></div>

    <div class="zz-tpl-col is-3"><a href="/jogador/test/123?epoca_id=153"><div>
      <div class="cromo_card medium"></div>
      <div class="team_name"><span title="Panther Force Jun.C S15" style="color:#101010;">Panther Force Jun.C S15</span></div>
    </div></a><div class="cromo_stats medium"><span class="text"><a href="/jogador/test/123?epoca_id=153">2023/24</a></span></div></div>

    <div class="zz-tpl-col is-3"><a href="/jogador/test/123?epoca_id=152"><div>
      <div class="cromo_card medium"></div>
      <div class="team_name"><span title="SC Coimbrões Jun.F S9" style="color:#101010;">SC Coimbrões Jun.F S9</span></div>
    </div></a><div class="cromo_stats medium"><span class="text"><a href="/jogador/test/123?epoca_id=152">2022/23</a></span></div></div>

    <!-- Career table — only shows current season (rest behind "+14 registos" login wall) -->
    <div>HISTÓRICO</div>
    <table class="career">
    <thead><tr><th>ÉPOCA</th><th>EQUIPA</th><th>J</th><th>G</th><th>AST</th></tr></thead>
    <tbody>
    <tr data-href="/equipa/boavista-fc/7074"><td></td><td>2025/26</td><td><div class="micrologo_and_text"><a href="/equipa/boavista-fc/7074">Boavista FC</a> <span class="grey">[Jun.C S15]</span></div></td><td>1</td><td><a href="#">0</a></td><td>-</td></tr>
    <tr data-href="/equipa/panther-force/74010"><td></td><td></td><td><div class="micrologo_and_text"><a href="/equipa/panther-force/74010">Panther Force</a> <span class="grey">[Jun.C S15]</span></div></td><td>15</td><td><a href="#">9</a></td><td>-</td></tr>
    <tr><td colspan="5" style="text-align:center;"><a href="/registar.php?op=spct">+14 registos</a></td></tr>
    </tbody></table>

    <div>Transferências</div>
    </body></html>
  `;

  it('parses rich layout career rows (micrologo_and_text)', () => {
    const result = parseZzProfileHtml(YOUTH_PLAYER_HTML)!;
    // Should find at least the 2 career table rows (2025/26)
    const tableRows = result.teamHistory.filter((h) => h.season === '2025/26');
    expect(tableRows.length).toBeGreaterThanOrEqual(2);
    expect(tableRows[0]).toMatchObject({ club: 'Boavista FC', team: 'Jun.C S15', season: '2025/26', games: 1, goals: 0 });
    expect(tableRows[1]).toMatchObject({ club: 'Panther Force', team: 'Jun.C S15', season: '2025/26', games: 15, goals: 9 });
  });

  it('extracts older seasons from cromo cards when career table is paginated', () => {
    const result = parseZzProfileHtml(YOUTH_PLAYER_HTML)!;
    const seasons = [...new Set(result.teamHistory.map((h) => h.season))];
    // Must include ALL seasons, not just 2025/26
    expect(seasons).toContain('2024/25');
    expect(seasons).toContain('2023/24');
    expect(seasons).toContain('2022/23');
  });

  it('cromo card entries have club and team parsed from title', () => {
    const result = parseZzProfileHtml(YOUTH_PLAYER_HTML)!;
    const entry2024 = result.teamHistory.find((h) => h.season === '2024/25');
    expect(entry2024).toBeDefined();
    expect(entry2024!.club).toBe('Panther Force');
    expect(entry2024!.team).toBe('Jun.B S17');
  });

  it('cromo card entries have 0 games/goals (stats not available without login)', () => {
    const result = parseZzProfileHtml(YOUTH_PLAYER_HTML)!;
    const entry2022 = result.teamHistory.find((h) => h.season === '2022/23');
    expect(entry2022).toBeDefined();
    expect(entry2022!.games).toBe(0);
    expect(entry2022!.goals).toBe(0);
  });

  it('does not duplicate seasons already in career table', () => {
    const result = parseZzProfileHtml(YOUTH_PLAYER_HTML)!;
    // 2025/26 appears in both career table AND cromo cards — should not be doubled
    const entries2025 = result.teamHistory.filter((h) => h.season === '2025/26');
    // Career table has 2 rows for 2025/26 (Boavista + Panther Force)
    // Cromo card also has 2025/26 Boavista — should NOT create a 3rd entry
    expect(entries2025.length).toBe(2);
  });

  // Rich layout — full career table without pagination (senior player)
  const SENIOR_PLAYER_HTML = `
    <html><body>
    <div class="card-data">info</div>
    <div>HISTÓRICO</div>
    <table class="career"><tbody>
    <tr><td></td><td>2025/26</td><td><div class="micrologo_and_text"><a href="/equipa/porto/5">FC Porto</a></div></td><td>20</td><td><a href="#">8</a></td><td>2</td></tr>
    <tr><td></td><td>2024/25</td><td><div class="micrologo_and_text"><a href="/equipa/benfica/4">SL Benfica</a></div></td><td>30</td><td><a href="#">12</a></td><td>5</td></tr>
    </tbody></table>
    <div>Transferências</div>
    </body></html>
  `;

  it('parses full career table for senior players (no cromo fallback needed)', () => {
    const result = parseZzProfileHtml(SENIOR_PLAYER_HTML)!;
    expect(result.teamHistory).toHaveLength(2);
    expect(result.teamHistory[0]).toMatchObject({ club: 'FC Porto', season: '2025/26', games: 20, goals: 8 });
    expect(result.teamHistory[1]).toMatchObject({ club: 'SL Benfica', season: '2024/25', games: 30, goals: 12 });
  });

  it('sets gamesSeason and goalsSeason from first career row', () => {
    const result = parseZzProfileHtml(SENIOR_PLAYER_HTML)!;
    expect(result.gamesSeason).toBe(20);
    expect(result.goalsSeason).toBe(8);
  });
});
