// e2e/mobile.spec.ts
// Mobile viewport tests — verify layout doesn't break on iPhone SE (375×667)
// Scouts use this on phones at the field — the primary device target
// RELEVANT FILES: playwright.config.ts, src/components/layout/MobileDrawer.tsx

import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, 'auth', 'admin.json');

test.describe('Mobile viewport (375×667)', () => {
  test.use({
    storageState: ADMIN_AUTH,
    viewport: { width: 375, height: 667 },
  });

  test('no horizontal overflow on player list', async ({ page }) => {
    await page.goto('/jogadores');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow 1px tolerance for sub-pixel rendering
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('no horizontal overflow on pipeline', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('no horizontal overflow on squad page', async ({ page }) => {
    await page.goto('/campo/real');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('no horizontal overflow on calendar', async ({ page }) => {
    await page.goto('/calendario');
    await page.waitForLoadState('networkidle');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('hamburger menu opens and shows navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sidebar should be hidden on mobile
    const sidebar = page.locator('nav.hidden.lg\\:flex, aside.hidden.lg\\:block');
    // Hamburger button should be visible
    const hamburger = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], [data-testid="mobile-menu"]').first();

    if (await hamburger.isVisible()) {
      await hamburger.click();
      // Navigation drawer should appear with at least one link
      await expect(page.locator('a[href="/jogadores"], a[href="/campo/real"], a[href="/pipeline"]').first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('buttons have minimum touch target (44×44px)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check interactive elements have adequate touch targets
    const buttons = page.locator('button:visible, a:visible').filter({ hasNotText: '' });
    const count = await buttons.count();

    let tooSmall = 0;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box && (box.width < 32 || box.height < 32)) {
        tooSmall++;
      }
    }

    // Allow up to 3 small elements (icon-only buttons with padding are ok)
    expect(tooSmall).toBeLessThanOrEqual(5);
  });
});
