// playwright.config.ts
// Playwright E2E test configuration — Chromium only, mobile + desktop viewports
// Requires test Supabase project (secrets in .env.test or CI env vars)
// RELEVANT FILES: e2e/, docs/test-strategy.md, .github/workflows/ci.yml

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
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

    // Mobile (iPhone SE — 375×667, primary target)
    {
      name: 'mobile',
      use: { ...devices['iPhone SE'] },
      dependencies: ['auth-setup'],
      testMatch: /mobile|smoke|a11y/,
    },
  ],

  // Start Next.js dev server for local runs
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
