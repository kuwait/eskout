// playwright.config.ts
// Playwright E2E test configuration — Chromium only, mobile + desktop viewports
// Requires test Supabase project (secrets in .env.test or CI env vars)
// RELEVANT FILES: e2e/, docs/test-strategy.md, .github/workflows/ci.yml

import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Load .env.local for test credentials (Playwright doesn't read Next.js env files)
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup — runs first, saves storage state for all projects
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Desktop (1280×720)
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['auth-setup'],
    },

    // Mobile (375×667, Chromium with mobile viewport — primary target)
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ['auth-setup'],
      testMatch: /mobile|smoke|a11y/,
    },
  ],

  // Start Next.js server — production build for reliable E2E, dev for quick iteration
  // CI pre-builds, so just `npm run start`; local can use dev or build+start
  webServer: {
    command: process.env.CI
      ? 'npm run start'
      : process.env.E2E_DEV
        ? 'npm run dev'
        : 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
