// src/actions/scraping/fpf-playwright.ts
// Headless Chromium fallback for FPF — bypasses Cloudflare JS challenges that cycletls can't solve
// Uses persistent context so cf_clearance cookies survive between dev server restarts
// RELEVANT FILES: src/actions/scraping/fpf-fetch.ts, src/actions/scraping/fpf.ts

import 'server-only';

import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { FpfFetchOptions, FpfFetchResult } from './fpf-fetch';

/* ───────────── Persistent context lifecycle ───────────── */

// CDP endpoint where the user's Brave is listening when launched via scripts/fpf_browser.sh.
// Cloudflare blocks Playwright-launched browsers but accepts user-launched browsers
// connected via CDP — the only deterministic bypass we found.
const CDP_ENDPOINT = process.env.FPF_BROWSER_CDP || 'http://localhost:9222';

// Fallback persistent profile (used only when CDP is unavailable).
const USER_DATA_DIR = path.join(process.cwd(), '.playwright-fpf-data');

// Idle timeout — close browser after this long without requests, to free RAM.
const IDLE_SHUTDOWN_MS = 10 * 60 * 1000; // 10 minutes

let _context: BrowserContext | null = null;
let _browser: Browser | null = null; // set when connected via CDP (don't close on shutdown)
let _page: Page | null = null;       // persistent page reused across requests (less focus stealing on macOS)
let _idleTimer: NodeJS.Timeout | null = null;
let _initPromise: Promise<BrowserContext> | null = null;

/** Lazy launch — single shared context across the whole process. */
async function getContext(): Promise<BrowserContext> {
  if (_context) {
    resetIdleTimer();
    return _context;
  }
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import so the bundler never tries to ship Playwright to the client
    const { chromium } = await import('playwright');

    // ── Preferred path: connect to user-launched Brave via CDP ──
    // The user starts Brave manually via scripts/fpf_browser.sh which opens
    // their REAL profile with --remote-debugging-port=9222. Playwright attaches
    // to that running browser → Cloudflare sees a 100% legitimate session
    // (cookies, history, fingerprint all match the user's normal browsing).
    try {
      const probe = await fetch(`${CDP_ENDPOINT}/json/version`, {
        signal: AbortSignal.timeout(500),
      });
      if (probe.ok) {
        console.log(`[FPF Playwright] connecting to user's Brave via CDP at ${CDP_ENDPOINT}`);
        const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        // First context is the user's real session (all cookies + storage)
        const ctx = browser.contexts()[0] ?? await browser.newContext();
        _browser = browser;
        _context = ctx;
        resetIdleTimer();
        console.log('[FPF Playwright] CDP connected');
        return ctx;
      }
    } catch {
      // CDP not available → fall through to launching our own
    }

    // ── Fallback: launch our own Brave (will likely be detected by Cloudflare) ──
    console.warn(
      '[FPF Playwright] CDP not available — falling back to launchPersistentContext.\n' +
      '   Para evitar bloqueios da Cloudflare, corre: ./scripts/fpf_browser.sh',
    );
    const executablePath = process.env.FPF_BROWSER_EXECUTABLE
      || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

    console.log(`[FPF Playwright] launching persistent context (${executablePath})…`);

    const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false, // headed mode avoids HeadlessChrome UA detection
      executablePath,
      // Strip every Playwright default flag that exposes automation. Cloudflare
      // detects: --enable-automation (sets navigator.webdriver), test-type, etc.
      ignoreDefaultArgs: [
        '--enable-automation',
        '--enable-blink-features=IdleDetection',
        '--disable-component-extensions-with-background-pages',
        '--disable-extensions',
        '--disable-default-apps',
      ],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-first-run',
      ],
      viewport: { width: 1280, height: 800 },
      locale: 'pt-PT',
      timezoneId: 'Europe/Lisbon',
    });

    // Stealth patches that run before any page script — strips navigator.webdriver
    // and hardens common automation-detection vectors that the launch flags miss.
    await ctx.addInitScript(() => {
      // navigator.webdriver — most common automation flag
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined });
      // chrome runtime — bot-only browsers don't have window.chrome.runtime
      const chromeWin = (window as unknown as { chrome?: Record<string, unknown> }).chrome;
      if (chromeWin && !chromeWin.runtime) chromeWin.runtime = {};
      // Permissions API — headless quirk where notifications return 'denied' but Notification.permission is 'default'
      const origQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (origQuery) {
        window.navigator.permissions.query = ((parameters: PermissionDescriptor) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : origQuery(parameters)) as typeof window.navigator.permissions.query;
      }
    });

    _context = ctx;
    resetIdleTimer();
    console.log('[FPF Playwright] context ready');
    return ctx;
  })();

  try {
    return await _initPromise;
  } finally {
    _initPromise = null;
  }
}

function resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    void shutdown();
  }, IDLE_SHUTDOWN_MS);
}

async function shutdown() {
  if (!_context) return;
  const ctx = _context;
  const browser = _browser;
  const page = _page;
  _context = null;
  _browser = null;
  _page = null;
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = null;
  try {
    // Always try to close the scraping tab so the user's Brave is left tidy
    if (page && !page.isClosed()) {
      await page.close().catch(() => undefined);
    }
    if (browser) {
      // CDP connection — disconnect only, leave the user's Brave running
      console.log('[FPF Playwright] idle timeout — disconnecting from CDP (browser stays open)');
      await browser.close();
    } else {
      // We launched it ourselves — close it
      console.log('[FPF Playwright] idle timeout — closing launched browser');
      await ctx.close();
    }
  } catch (e) {
    console.warn('[FPF Playwright] close error:', e);
  }
}

/** Get or create the single persistent scraping page. Recreated if it was closed. */
async function getPage(ctx: BrowserContext): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;
  _page = await ctx.newPage();
  return _page;
}

/** Serialize all operations that navigate the shared scraping page.
 *  Without this, parallel callers race on page.goto() → net::ERR_ABORTED. */
let _pageMutex: Promise<void> = Promise.resolve();
async function withPageLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = _pageMutex;
  let release!: () => void;
  _pageMutex = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

/* ───────────── Public API: fetch via Playwright ───────────── */

/** Fetch an FPF URL through a real headless Chromium so Cloudflare JS challenges
 *  resolve transparently. Falls back to context.request for non-HTML calls (POST, JSON).
 *  Returns the same FpfFetchResult shape as fpfFetch (cycletls/plain fetch path). */
export async function fpfFetchViaPlaywright(
  url: string,
  options: FpfFetchOptions = {},
): Promise<FpfFetchResult | null> {
  const t0 = Date.now();
  const method = options.method ?? 'GET';
  const shortUrl = url.length > 90 ? url.slice(0, 87) + '…' : url;

  try {
    const ctx = await getContext();

    // ── POST or non-HTML → use context.request (shares cookies + cf_clearance) ──
    if (method === 'POST' || options.headers?.['X-Requested-With']) {
      const res = await ctx.request.fetch(url, {
        method,
        headers: options.headers,
        data: options.body,
        timeout: 30000,
      });
      const status = res.status();
      console.log(`[FPF Playwright req] ${method} ${status} ${Date.now() - t0}ms ${shortUrl}`);
      const setCookies = res.headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value);
      // Buffer body once so text() and json() can both be called
      const buf = await res.body();
      return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => buf.toString('utf-8'),
        json: async <T = unknown>() => JSON.parse(buf.toString('utf-8')) as T,
        setCookies,
      };
    }

    // ── GET HTML → real page navigation (Cloudflare JS challenge runs here) ──
    // Reuse a single persistent tab across requests — opening/closing tabs steals
    // window focus on macOS every time, which is annoying when scraping in batch.
    // withPageLock serializes parallel callers (binary + HTML) so they don't race on goto().
    return await withPageLock(async () => {
      const page = await getPage(ctx);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait briefly for Cloudflare JS challenge to swap in the real content
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

      const status = response?.status() ?? 0;
      const html = await page.content();

      // Detect "Automated message" Cloudflare block page (status 403 with banner)
      const blocked = status === 403 && html.includes('Automated message');
      console.log(
        `[FPF Playwright nav] GET ${status}${blocked ? ' BLOCKED' : ''} ${Date.now() - t0}ms ${shortUrl}`,
      );

      // Extract Set-Cookie from main document response
      const setCookies: string[] = [];
      const headers = response?.headers() ?? {};
      const sc = headers['set-cookie'];
      if (sc) {
        // Playwright joins multiple Set-Cookie with newlines
        setCookies.push(...sc.split('\n'));
      }

      resetIdleTimer();
      return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => html,
        json: async <T = unknown>() => JSON.parse(html) as T,
        setCookies,
      };
    });
  } catch (e) {
    console.warn('[FPF Playwright] error:', e);
    return null;
  }
}

/** Force-close the Playwright context. Used for tests + clean shutdown. */
export async function fpfPlaywrightShutdown(): Promise<void> {
  await shutdown();
}

/* ───────────── Binary fetch (images, etc.) ───────────── */

/** Fetch a binary resource (image, file) through the Playwright/CDP browser context.
 *  Uses page.goto() — the same network stack that loads <img> tags successfully.
 *  ctx.request.fetch() sends a different User-Agent/headers and gets blocked by Cloudflare. */
export async function fpfFetchBinaryViaPlaywright(
  url: string,
): Promise<{ status: number; ok: boolean; contentType: string; body: Buffer } | null> {
  const t0 = Date.now();
  const shortUrl = url.length > 90 ? url.slice(0, 87) + '…' : url;
  try {
    const ctx = await getContext();
    // withPageLock serializes parallel callers — same shared page as HTML scraping.
    // Without this, concurrent page.goto() calls cancel each other (net::ERR_ABORTED).
    return await withPageLock(async () => {
      const page = await getPage(ctx);
      // Navigate the persistent page directly to the image URL — browser shows the image
      // and we read the raw response bytes. Same fetch path as <img src=...>.
      const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      if (!response) return null;
      const status = response.status();
      const contentType = response.headers()['content-type'] || '';
      const body = await response.body();
      console.log(`[FPF Playwright bin] GET ${status} ${Date.now() - t0}ms ${shortUrl}`);
      resetIdleTimer();
      return {
        status,
        ok: status >= 200 && status < 300,
        contentType,
        body,
      };
    });
  } catch (e) {
    console.warn('[FPF Playwright bin] error:', e);
    return null;
  }
}
