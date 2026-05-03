// scripts/test_match_parser.ts
// Fetches a real FPF match sheet via Brave/CDP and saves it as a Jest fixture.
// Run: npx tsx scripts/test_match_parser.ts <matchId?>
// Requires Brave running with --remote-debugging-port=9222 (./scripts/fpf_browser.sh)
// RELEVANT FILES: src/actions/scraping/fpf-competitions/__tests__/parse-match-2376960.test.ts

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

const MATCH_ID = parseInt(process.argv[2] ?? '2376960', 10);
const CDP_ENDPOINT = 'http://localhost:9222';
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'actions', 'scraping', 'fpf-competitions', '__tests__', 'fixtures');

async function fetchMatchHtml(url: string): Promise<string> {
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const ctx = browser.contexts()[0] ?? await browser.newContext();
  const page = await ctx.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    if (!response || !response.ok()) {
      throw new Error(`fetch failed: status=${response?.status()}`);
    }
    return await page.content();
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function main() {
  const url = `https://resultados.fpf.pt/Match/GetMatchInformation?matchId=${MATCH_ID}`;
  console.log(`[fetch] ${url}`);

  const html = await fetchMatchHtml(url);
  console.log(`✓ fetched ${html.length.toLocaleString()} chars`);

  // Apostrophe diagnostic — what form does this match use?
  const encoded = (html.match(/\d+&#39;/g) ?? []).length;
  const literal = (html.match(/\d+'/g) ?? []).length;
  console.log(`  apostrophe markers: encoded=${encoded}, literal=${literal}`);

  // Quick structural sanity — count expected elements without importing the parser
  const titleBars = (html.match(/<div class="title-bar">/g) ?? []).length;
  const lineupTeams = (html.match(/lineup-team\s+(home|away)-team/g) ?? []).length;
  const playerDivs = (html.match(/class="player\s/g) ?? []).length;
  const subEvents = (html.match(/icon-substitution/g) ?? []).length;
  console.log(`  HTML structure: title-bars=${titleBars}, lineup-teams=${lineupTeams}, player-divs=${playerDivs}, sub-events=${subEvents}`);

  // Save fixture
  const fixturePath = path.join(FIXTURE_DIR, `match-${MATCH_ID}.html`);
  fs.writeFileSync(fixturePath, html, 'utf-8');
  console.log(`✓ saved ${fixturePath}`);
  console.log(`\nNow run: npm test -- parse-match-${MATCH_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
