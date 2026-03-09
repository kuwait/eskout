// e2e/auth.setup.ts
// Playwright auth setup — logs in test users and saves browser storage state
// Runs before all E2E tests; saved states are reused by test projects
// RELEVANT FILES: playwright.config.ts, e2e/smoke.spec.ts

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const ADMIN_FILE = path.join(__dirname, 'auth', 'admin.json');
const SCOUT_FILE = path.join(__dirname, 'auth', 'scout.json');
const EDITOR_FILE = path.join(__dirname, 'auth', 'editor.json');

// Test credentials — set via env vars or .env.test
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.eskout.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test123456';
const SCOUT_EMAIL = process.env.TEST_SCOUT_EMAIL || 'scout@test.eskout.com';
const SCOUT_PASSWORD = process.env.TEST_SCOUT_PASSWORD || 'test123456';
const EDITOR_EMAIL = process.env.TEST_EDITOR_EMAIL || 'editor@test.eskout.com';
const EDITOR_PASSWORD = process.env.TEST_EDITOR_PASSWORD || 'test123456';

async function loginAndSave(
  page: ReturnType<Awaited<ReturnType<typeof setup.info>>['project']['use']['browserName'] extends string ? never : never> extends never ? any : any,
  email: string,
  password: string,
  storageFile: string
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect away from login
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 10_000 });
  await page.context().storageState({ path: storageFile });
}

setup('authenticate admin', async ({ page }) => {
  await loginAndSave(page, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FILE);
});

setup('authenticate scout', async ({ page }) => {
  await loginAndSave(page, SCOUT_EMAIL, SCOUT_PASSWORD, SCOUT_FILE);
});

setup('authenticate editor', async ({ page }) => {
  await loginAndSave(page, EDITOR_EMAIL, EDITOR_PASSWORD, EDITOR_FILE);
});
