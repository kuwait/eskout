// src/actions/scraping.ts
// Barrel re-export — all scraping server actions and types from the scraping/ subdirectory
// Split from a single 1906-line file into 7 focused modules for maintainability
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/scraping/zerozero.ts, src/actions/scraping/unified.ts

// FPF scraping
export { scrapePlayerFpf } from './scraping/fpf';
export type { FpfScrapeResult } from './scraping/fpf';

// ZeroZero scraping
export { scrapePlayerZeroZero } from './scraping/zerozero';
export type { ZzScrapeResult } from './scraping/zerozero';

// Unified scrape (FPF + ZZ merged) + apply
export { scrapePlayerAll, applyScrapedData } from './scraping/unified';
export type { ScrapedChanges, PreFetchedZz } from './scraping/unified';

// Link-based scraping (new player flow, scout reports, auto-scrape)
export { scrapeFromLinks, scrapeForScoutReport, autoScrapePlayer } from './scraping/links';
export type { ScrapedNewPlayerData, ScoutReportScrapeResult } from './scraping/links';

// Bulk update
export { bulkScrapeExternalData } from './scraping/bulk';
export type { BulkUpdateProgress } from './scraping/bulk';

// ZeroZero link finder
export { findZeroZeroLinks, findZeroZeroLinkForPlayer } from './scraping/zz-finder';
export type { ZzLinkFinderResult } from './scraping/zz-finder';
