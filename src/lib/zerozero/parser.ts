// src/lib/zerozero/parser.ts
// Pure HTML parsing functions for ZeroZero profile pages and autocomplete results
// No fetch calls — works in both client and server environments
// RELEVANT FILES: src/lib/zerozero/helpers.ts, src/lib/zerozero/client.ts, src/actions/scraping.ts

import type { ZzSearchCandidate } from './helpers';

/* ───────────── Types ───────────── */

export interface ZzParsedProfile {
  fullName: string | null;
  dob: string | null;
  currentClub: string | null;
  currentTeam: string | null;
  photoUrl: string | null;
  clubLogoUrl: string | null;
  height: number | null;
  weight: number | null;
  nationality: string | null;
  birthCountry: string | null;
  position: string | null;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  foot: string | null;
  shirtNumber: number | null;
  gamesSeason: number | null;
  goalsSeason: number | null;
  teamHistory: { club: string; team?: string; season: string; games: number; goals: number }[];
}

/* ───────────── Profile Page Parser ───────────── */

/**
 * Parse a ZeroZero player profile page HTML into structured data.
 * Extracted from fetchZeroZeroData() in src/actions/scraping.ts.
 * Expects the HTML to be already decoded (e.g. from ISO-8859-1).
 */
export function parseZzProfileHtml(html: string): ZzParsedProfile | null {
  // Detect captcha page content or empty/invalid responses
  // ZZ pages may include a recaptcha script on valid pages — only treat as blocked if
  // the page lacks real content markers (card-data, ld+json, zz-enthdr)
  const hasMarkers = html.includes('card-data') || html.includes('ld+json') || html.includes('zz-enthdr');
  if (html.length === 0 || !hasMarkers) {
    return null;
  }

  const result: ZzParsedProfile = {
    fullName: null,
    dob: null,
    currentClub: null,
    currentTeam: null,
    photoUrl: null,
    clubLogoUrl: null,
    height: null,
    weight: null,
    nationality: null,
    birthCountry: null,
    position: null,
    secondaryPosition: null,
    tertiaryPosition: null,
    foot: null,
    shirtNumber: null,
    gamesSeason: null,
    goalsSeason: null,
    teamHistory: [],
  };

  /* ── 1. JSON-LD (basic fields only — many are empty/useless on ZeroZero) ── */
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (typeof ld.image === 'string' && ld.image) result.photoUrl = ld.image;

      // Name from JSON-LD Person schema
      if (typeof ld.name === 'string' && ld.name) result.fullName = ld.name;

      // birthDate: JSON-LD uses ISO format "yyyy-MM-dd" or "dd/MM/yyyy"
      if (ld.birthDate && typeof ld.birthDate === 'string') {
        const raw = ld.birthDate.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          result.dob = raw.slice(0, 10);
        } else {
          const ddMM = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (ddMM) result.dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`;
        }
      }

      // Nationality (usually works)
      if (ld.nationality) {
        if (typeof ld.nationality === 'string' && ld.nationality) result.nationality = ld.nationality;
        else if (typeof ld.nationality === 'object' && ld.nationality.name) result.nationality = ld.nationality.name;
      }

      // Height: "185 cm" → 185
      if (ld.height) {
        const hMatch = String(ld.height).match(/(\d+)/);
        if (hMatch) result.height = parseInt(hMatch[1], 10);
      }

      // Weight: "70 kg" → 70
      if (ld.weight) {
        const wMatch = String(ld.weight).match(/(\d+)/);
        if (wMatch) result.weight = parseInt(wMatch[1], 10);
      }

      // Club from worksFor (often empty string on ZeroZero)
      // worksFor can be: string, object, array, or a string containing a JSON array
      if (ld.worksFor) {
        if (typeof ld.worksFor === 'string' && ld.worksFor) {
          // Sometimes ZeroZero puts a raw JSON array as a string: "[{@type:SportsTeam,name:Padroense}]"
          if (ld.worksFor.startsWith('[') || ld.worksFor.startsWith('{')) {
            try {
              const parsed = JSON.parse(ld.worksFor);
              const org = Array.isArray(parsed) ? parsed[0] : parsed;
              result.currentClub = org?.name || null;
            } catch {
              // Not valid JSON — extract name with regex as fallback
              const nameMatch = ld.worksFor.match(/name[":]+\s*([^,"}\]]+)/i);
              result.currentClub = nameMatch ? nameMatch[1].trim() : null;
            }
          } else {
            result.currentClub = ld.worksFor;
          }
        } else if (typeof ld.worksFor === 'object') {
          const org = Array.isArray(ld.worksFor) ? ld.worksFor[0] : ld.worksFor;
          result.currentClub = org?.name || null;
        }
      }

      // Description fallback — "Joga como Avançado em Leixões"
      if (ld.description && typeof ld.description === 'string') {
        const descClub = ld.description.match(/Joga como\s+.+?\s+em\s+([^,\.]+)/);
        if (descClub && !result.currentClub) result.currentClub = descClub[1].trim();

        const descPos = ld.description.match(/Joga(?:va)? como\s+([^,\.]+?)(?:\s+em\s+|\s*[,\.])/);
        if (descPos) result.position = descPos[1].trim();
      }
    } catch { /* JSON-LD parse failed, continue with HTML parsing */ }
  }

  /* ── 2. HTML card-data sidebar — multiple extraction strategies per field ── */
  // ZeroZero HTML varies between players/pages. Each field has multiple fallbacks.

  // Helper: extract the full HTML block for a card-data row by label regex
  function cardRowHtml(label: string): string | null {
    const re = new RegExp(`card-data__label">${label}</span>([\\s\\S]*?)(?=card-data__label|card-data__footer|card-data__header|$)`, 'i');
    const m = html.match(re);
    return m ? m[1] : null;
  }

  // Helper: extract plain-text value from a card-data row
  function cardValue(label: string): string | null {
    const block = cardRowHtml(label);
    if (!block) return null;
    const valMatch = block.match(/card-data__value[^>]*>([^<]+)/);
    return valMatch ? valMatch[1].trim() : null;
  }

  // Helper: extract ALL plain-text values from a card-data row (multi-value fields)
  function cardValues(label: string): string[] {
    const block = cardRowHtml(label);
    if (!block) return [];
    const values: string[] = [];
    const re = /card-data__value[^>]*>([^<]+)/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const v = m[1].trim();
      if (v) values.push(v);
    }
    return values;
  }

  // Helper: extract text from micrologo_and_text structure (nationality, country, club)
  function cardValueWithFlag(label: string): string | null {
    const block = cardRowHtml(label);
    if (!block) return null;
    // Try class="text"> first (standard micrologo_and_text)
    const textMatch = block.match(/class="text">([^<]+)/);
    if (textMatch) return textMatch[1].trim();
    // Fallback: title attribute in flag/link
    const titleMatch = block.match(/title="([^"]+)"/);
    if (titleMatch) return titleMatch[1].trim();
    // Fallback: plain value
    const valMatch = block.match(/card-data__value[^>]*>([^<]+)/);
    return valMatch ? valMatch[1].trim() : null;
  }

  // Generic fallback: search the full page for a pattern near a keyword
  function findNearby(keyword: string, valuePattern: RegExp): string | null {
    const idx = html.indexOf(keyword);
    if (idx < 0) return null;
    const slice = html.slice(idx, idx + 500);
    const m = slice.match(valuePattern);
    return m ? m[1].trim() : null;
  }

  /* ── Name — sidebar > header h1 > JSON-LD > og:title ── */
  if (!result.fullName) result.fullName = cardValue('Nome');
  if (!result.fullName) {
    // Header: <h1><span class="name">7.André Ferreira</span></h1> — strip leading number
    const h1 = html.match(/<h1[^>]*>(?:<[^>]+>)*\s*(?:\d+\.\s*)?([A-ZÀ-ÿ][^<]+)/i);
    if (h1) result.fullName = h1[1].trim();
  }
  if (!result.fullName) {
    const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
    if (og) result.fullName = og[1].replace(/\s*[-|].*/, '').trim();
  }

  /* ── DOB — sidebar > JSON-LD > any ISO date near "nascimento" ── */
  if (!result.dob) {
    const dobVal = cardValue('Data de Nascimento') || cardValue('Nascimento');
    if (dobVal) {
      const ddMM = dobVal.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (ddMM) result.dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`;
      else {
        const iso = dobVal.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (iso) result.dob = `${iso[1]}-${iso[2]}-${iso[3]}`;
      }
    }
  }
  // Fallback: any yyyy-MM-dd near "Nascimento" in the page
  if (!result.dob) {
    const nearby = findNearby('Nascimento', /(\d{4}-\d{2}-\d{2})/);
    if (nearby) result.dob = nearby;
  }

  /* ── Position — sidebar (multi-value) > JSON-LD description > meta tags ── */
  const sidebarPositions = cardValues('Posi[çc][ãa]o');
  if (sidebarPositions.length > 0 && sidebarPositions[0].length < 40) {
    result.position = sidebarPositions[0];
    if (sidebarPositions[1] && sidebarPositions[1].length < 40) result.secondaryPosition = sidebarPositions[1];
    if (sidebarPositions[2] && sidebarPositions[2].length < 40) result.tertiaryPosition = sidebarPositions[2];
  }
  if (!result.position) {
    // og:description often has "Joga como Médio Ofensivo"
    const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
    if (ogDesc) {
      const posMatch = ogDesc[1].match(/Joga(?:va)? como\s+([^,\.]+?)(?:\s+em\s+|\s*[,\.])/);
      if (posMatch) result.position = posMatch[1].trim();
    }
  }

  /* ── Foot — sidebar > any "Direito"/"Esquerdo" near "Pé" ── */
  if (!result.foot) {
    const foot = cardValue('P[ée]\\s*[Pp]referencial') || cardValue('P[ée]');
    if (foot) {
      const raw = foot.toLowerCase();
      if (raw.includes('direito') || raw === 'right') result.foot = 'Dir';
      else if (raw.includes('esquerdo') || raw === 'left') result.foot = 'Esq';
      else if (raw.includes('ambidextro') || raw.includes('amb')) result.foot = 'Amb';
    }
  }
  // Fallback: search near keyword
  if (!result.foot) {
    const nearby = findNearby('referencial', />(Direito|Esquerdo|Ambidextro)</i);
    if (nearby) {
      const raw = nearby.toLowerCase();
      if (raw.includes('direito')) result.foot = 'Dir';
      else if (raw.includes('esquerdo')) result.foot = 'Esq';
      else if (raw.includes('ambidextro')) result.foot = 'Amb';
    }
  }

  /* ── Club — sidebar (with flag) > header > JSON-LD description ── */
  if (!result.currentClub) {
    result.currentClub = cardValueWithFlag('Clube atual') || cardValueWithFlag('Clube');
  }
  if (!result.currentClub) {
    // Header club link
    const clubMatch = html.match(/class="zz-enthdr-club"[^>]*>([^<]+)/);
    if (clubMatch) {
      const club = clubMatch[1].trim();
      if (club && club !== 'Sem Equipa') result.currentClub = club;
    }
  }

  /* ── Nationality — sidebar (with flag) > JSON-LD (already set above) ── */
  if (!result.nationality) {
    result.nationality = cardValueWithFlag('Nacionalidade');
  }
  // Fallback: nearby keyword search
  if (!result.nationality) {
    const nearby = findNearby('Nacionalidade', /class="text">([^<]+)/);
    if (nearby) result.nationality = nearby;
  }

  /* ── Birth country — sidebar (with flag) > nearby keyword ── */
  if (!result.birthCountry) {
    result.birthCountry = cardValueWithFlag('Pa[ií]s de Nascimento') || cardValueWithFlag('Pa[ií]s');
  }
  if (!result.birthCountry) {
    const nearby = findNearby('Nascimento', /class="text">([^<]+)/);
    // Only use if it looks like a country, not a date
    if (nearby && !/\d/.test(nearby)) result.birthCountry = nearby;
  }
  // Fallback: if no birth country but nationality exists, assume same
  if (!result.birthCountry && result.nationality) {
    result.birthCountry = result.nationality;
  }

  /* ── Height — sidebar > JSON-LD (already set above) > nearby keyword ── */
  if (!result.height) {
    const hVal = cardValue('Altura');
    if (hVal) {
      const hMatch = hVal.match(/(\d{2,3})/);
      if (hMatch) result.height = parseInt(hMatch[1], 10);
    }
  }
  if (!result.height) {
    const nearby = findNearby('Altura', /(\d{2,3})\s*(?:cm)?/);
    if (nearby) result.height = parseInt(nearby, 10);
  }

  /* ── Weight — sidebar > JSON-LD (already set above) > nearby keyword ── */
  if (!result.weight) {
    const wVal = cardValue('Peso');
    if (wVal) {
      const wMatch = wVal.match(/(\d{2,3})/);
      if (wMatch) result.weight = parseInt(wMatch[1], 10);
    }
  }
  if (!result.weight) {
    const nearby = findNearby('Peso', /(\d{2,3})\s*(?:kg)?/);
    if (nearby) result.weight = parseInt(nearby, 10);
  }

  /* ── Shirt number — sidebar > header ── */
  if (!result.shirtNumber) {
    const shirtVal = cardValue('N[úu]mero') || cardValue('Camisola');
    if (shirtVal) {
      const num = shirtVal.match(/(\d{1,3})/);
      if (num) result.shirtNumber = parseInt(num[1], 10);
    }
  }
  if (!result.shirtNumber) {
    // Header: <span class="number" ...>7.</span> before player name
    const hdrNum = html.match(/class="number"[^>]*>\s*(\d{1,3})/);
    if (hdrNum) result.shirtNumber = parseInt(hdrNum[1], 10);
  }

  /* ── Club logo — header img > sidebar img ── */
  const clubLogoMatch = html.match(/zz-enthdr-club[\s\S]*?<img[^>]*src="(\/img\/logos\/equipas\/[^"]+)"/);
  if (clubLogoMatch) {
    result.clubLogoUrl = `https://www.zerozero.pt${clubLogoMatch[1]}`;
  }
  // Fallback: sidebar club row logo
  if (!result.clubLogoUrl) {
    const sidebarLogo = cardRowHtml('Clube atual') || cardRowHtml('Clube');
    if (sidebarLogo) {
      const logoMatch = sidebarLogo.match(/<img[^>]*src="(\/img\/logos\/equipas\/[^"]+)"/);
      if (logoMatch) result.clubLogoUrl = `https://www.zerozero.pt${logoMatch[1]}`;
    }
  }

  /* ── Photo — JSON-LD (already set) > og:image > page img tag ── */
  if (!result.photoUrl) {
    const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    if (ogImage && /jogadores/i.test(ogImage[1])) result.photoUrl = ogImage[1];
  }
  if (!result.photoUrl) {
    const imgMatch = html.match(/src="([^"]*(?:cdn-img\.zerozero\.pt|zerozero\.pt)\/img\/jogadores\/[^"]+)"/);
    if (imgMatch) result.photoUrl = imgMatch[1];
  }
  // Fix protocol-relative URLs
  if (result.photoUrl && result.photoUrl.startsWith('//')) {
    result.photoUrl = 'https:' + result.photoUrl;
  }

  // Discard 0-value height/weight (parsing artifacts)
  if (result.height === 0) result.height = null;
  if (result.weight === 0) result.weight = null;

  /* ── Career history table ── */
  // Two ZZ HTML layouts for career summary rows:
  // A) Rich layout (senior/well-known players): micrologo_and_text class present
  //    td[0]=empty, td[1]=season, td[2]=club (inside micrologo_and_text), td[3]=games, td[4]=goals, td[5]=assists
  // B) Simple layout (youth players): no micrologo_and_text, plain <a> links
  //    td[0]=season (or omitted for sub-rows), td[1]=club, td[2]=games, td[3]=goals, td[4]=assists
  // Match rows (individual games) have many more <td> cells — we skip those.
  // Stop parsing when we hit the Transferências section.
  const transferIdx = html.search(/Transfer[eê]ncias/i);
  const careerHtml = transferIdx > 0 ? html.slice(0, transferIdx) : html;

  const careerRows = careerHtml.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
  let latestGames: number | null = null;
  let latestGoals: number | null = null;
  let isFirst = true;
  let currentSeason: string | null = null;

  for (const row of careerRows) {
    const rowHtml = row[0];

    // Extract all <td> cell contents
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 4) continue;
    // Skip match detail rows (7+ cells: date, opponent, result, etc.)
    if (tds.length > 6) continue;

    // Detect layout: rich (micrologo_and_text, 6 TDs) vs simple (plain links, 4-5 TDs)
    const isRich = rowHtml.includes('micrologo_and_text');
    // In rich layout td indices are shifted by 1 (td[0] is empty)
    const offset = isRich ? 1 : 0;

    // Season cell — may be empty for sub-teams in the same season
    const seasonTd = tds[offset];
    const seasonMatch = seasonTd?.match(/(20\d{2}\/\d{2})/);
    if (seasonMatch) currentSeason = seasonMatch[1];
    if (!currentSeason) continue;

    // Club cell — club name inside <a> tag with /equipa/ href, team/escalão in brackets
    const clubTd = tds[offset + 1];
    const clubMatch = clubTd?.match(/<a[^>]*>([^<]+)<\/a>/);
    const club = clubMatch ? clubMatch[1].trim() : '';
    if (!club) continue;

    const teamMatch = clubTd.match(/\[([^\]]+)\]/);
    const team = teamMatch ? teamMatch[1].trim() : undefined;

    // Games — strip HTML to get visible number only
    const gamesTd = tds[offset + 2] ?? '';
    const gamesText = gamesTd.replace(/<[^>]+>/g, '').trim();
    const gamesNum = gamesText.match(/^(\d+)$/);
    const games = gamesNum ? parseInt(gamesNum[1], 10) : 0;

    // Goals — text content of <a> tag (strip HTML to get visible number, not href digits)
    const goalsTd = tds[offset + 3] ?? '';
    const goalsText = goalsTd.replace(/<[^>]+>/g, '').trim();
    const goalsNum = goalsText.match(/^(\d+)$/);
    const goals = goalsNum ? parseInt(goalsNum[1], 10) : 0;

    if (isFirst) {
      result.currentTeam = club;
      latestGames = games;
      latestGoals = goals;
      isFirst = false;
    }

    result.teamHistory.push({ club, ...(team ? { team } : {}), season: currentSeason, games, goals });
  }

  result.gamesSeason = latestGames;
  result.goalsSeason = latestGoals;

  return result;
}

/* ───────────── Autocomplete Results Parser ───────────── */

/** Parse ZeroZero autocomplete search results HTML into structured candidates */
export function parseZzAutocompleteHtml(html: string): ZzSearchCandidate[] {
  const candidates: ZzSearchCandidate[] = [];

  // Each result: <a href="/jogador/slug/ID?search=1" ...>...<span>Jogadores | Posição | XX anos | Clube</span>...</a>
  const linkRegex = /href="(\/jogador\/[^"?]+)[^"]*"[\s\S]*?<span>([^<]*)<\/span>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const info = match[2];

    // Parse info: "Jogadores | Médio | 12 anos | Sporting [Jun.C S15 C]"
    const parts = info.split('|').map((p) => p.trim());
    // Skip non-player results
    if (!parts[0]?.includes('Jogador')) continue;

    const ageMatch = info.match(/(\d+)\s*anos/);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : null;

    // Club is usually the last part, remove age group brackets
    const clubPart = parts.length >= 4 ? parts[3] : null;
    const club = clubPart ? clubPart.replace(/\s*\[.*\]/, '').trim() : null;

    const position = parts.length >= 2 ? parts[1] : null;

    // Name from the text div — search WITHIN the matched <a> block (after href, before </a>)
    const nameMatch = match[0].match(/class="text">([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : '';

    candidates.push({ url: `https://www.zerozero.pt${url}`, name, age, club, position });
  }

  return candidates;
}
