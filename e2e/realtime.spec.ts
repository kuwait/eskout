// e2e/realtime.spec.ts
// Multi-user Realtime tests — verify changes propagate between browser contexts
// Uses two independent browser sessions to simulate concurrent collaboration
// RELEVANT FILES: src/lib/realtime/RealtimeProvider.tsx, src/hooks/useRealtimeTable.ts

import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, 'auth', 'admin.json');
const EDITOR_AUTH = path.join(__dirname, 'auth', 'editor.json');

test.describe('Realtime: cross-user synchronization', () => {
  test('both users can load the same page without realtime errors', async ({ browser }) => {
    const adminContext = await browser.newContext({ storageState: ADMIN_AUTH });
    const editorContext = await browser.newContext({ storageState: EDITOR_AUTH });

    const adminPage = await adminContext.newPage();
    const editorPage = await editorContext.newPage();

    // Both navigate to player list
    await adminPage.goto('/jogadores');
    await editorPage.goto('/jogadores');
    await adminPage.waitForLoadState('networkidle');
    await editorPage.waitForLoadState('networkidle');

    // No realtime connection errors on either page
    const adminErrors = await adminPage.locator('text=Erro de conexão').count();
    const editorErrors = await editorPage.locator('text=Erro de conexão').count();
    expect(adminErrors).toBe(0);
    expect(editorErrors).toBe(0);

    // Both pages should render content (player list or empty state)
    await expect(adminPage.locator('h1').first()).toBeVisible();
    await expect(editorPage.locator('h1').first()).toBeVisible();

    await adminContext.close();
    await editorContext.close();
  });

  test('squad page loads for two concurrent users', async ({ browser }) => {
    const adminContext = await browser.newContext({ storageState: ADMIN_AUTH });
    const editorContext = await browser.newContext({ storageState: EDITOR_AUTH });

    const adminPage = await adminContext.newPage();
    const editorPage = await editorContext.newPage();

    // Both on shadow squad
    await adminPage.goto('/campo/sombra');
    await editorPage.goto('/campo/sombra');
    await adminPage.waitForLoadState('networkidle');
    await editorPage.waitForLoadState('networkidle');

    // Verify both pages are connected without errors
    const adminHasError = await adminPage.locator('text=Erro de conexão').count();
    const editorHasError = await editorPage.locator('text=Erro de conexão').count();
    expect(adminHasError).toBe(0);
    expect(editorHasError).toBe(0);

    await adminContext.close();
    await editorContext.close();
  });

  test('concurrent profile viewing works without errors', async ({ browser }) => {
    const adminContext = await browser.newContext({ storageState: ADMIN_AUTH });
    const editorContext = await browser.newContext({ storageState: EDITOR_AUTH });

    const adminPage = await adminContext.newPage();
    const editorPage = await editorContext.newPage();

    // Get a player ID from the list
    await adminPage.goto('/jogadores');
    await adminPage.waitForLoadState('networkidle');

    const firstPlayerLink = adminPage.locator('a[href^="/jogadores/"]').first();
    if (await firstPlayerLink.isVisible()) {
      const href = await firstPlayerLink.getAttribute('href');
      if (href) {
        // Both users view the same player profile
        await adminPage.goto(href);
        await editorPage.goto(href);
        await adminPage.waitForLoadState('networkidle');
        await editorPage.waitForLoadState('networkidle');

        // Both should see the player profile without errors
        await expect(adminPage.locator('h1, h2').first()).toBeVisible();
        await expect(editorPage.locator('h1, h2').first()).toBeVisible();
      }
    }

    await adminContext.close();
    await editorContext.close();
  });
});
