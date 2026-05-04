// e2e/smoke.spec.ts
// Smoke tests — verify every page renders without crashing (200 OK, no error boundary)
// Catches broken imports, server component errors, and missing data
// RELEVANT FILES: playwright.config.ts, src/middleware.ts, src/app/

import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, 'auth', 'admin.json');
const SCOUT_AUTH = path.join(__dirname, 'auth', 'scout.json');

/* ───────────── Admin routes ───────────── */

const ADMIN_ROUTES = [
  '/',
  '/jogadores',
  '/campo/real',
  '/campo/sombra',
  '/pipeline',
  '/calendario',
  '/alertas',
  '/posicoes',
  '/exportar',
  '/preferencias',
  '/admin/utilizadores',
  '/admin/relatorios',
];

test.describe('Smoke: admin pages render', () => {
  test.use({ storageState: ADMIN_AUTH });

  for (const route of ADMIN_ROUTES) {
    test(`${route} loads without error`, async ({ page }) => {
      const response = await page.goto(route);
      // Page loaded (might redirect, but shouldn't 500)
      expect(response?.status()).toBeLessThan(500);
      // No Next.js error overlay
      await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible({ timeout: 2000 });
      // No generic "error" boundary text
      await expect(page.locator('text=Something went wrong')).not.toBeVisible({ timeout: 1000 });
    });
  }
});

/* ───────────── Scout routes ───────────── */

const SCOUT_ROUTES = [
  '/meus-relatorios',
  '/submeter',
  '/meus-jogadores',
  '/jogadores/novo',
  '/preferencias',
];

test.describe('Smoke: scout pages render', () => {
  test.use({ storageState: SCOUT_AUTH });

  for (const route of SCOUT_ROUTES) {
    test(`${route} loads without error`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible({ timeout: 2000 });
    });
  }
});

/* ───────────── Scout blocked routes ───────────── */

test.describe('Smoke: scout is blocked from admin routes', () => {
  test.use({ storageState: SCOUT_AUTH });

  const BLOCKED_FOR_SCOUT = ['/admin/utilizadores', '/pipeline', '/exportar'];

  for (const route of BLOCKED_FOR_SCOUT) {
    test(`${route} redirects scout away`, async ({ page }) => {
      await page.goto(route);
      // Scout should NOT end up on the admin page — should be redirected
      expect(page.url()).not.toContain(route);
    });
  }
});
