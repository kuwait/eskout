// e2e/a11y.spec.ts
// Accessibility tests using axe-core — checks WCAG 2.1 A/AA on key pages
// Scouts use this on phones in the sun — a11y matters for usability
// RELEVANT FILES: playwright.config.ts, e2e/smoke.spec.ts

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, 'auth', 'admin.json');

// Pages with the most user interaction — highest a11y impact
const PAGES_TO_CHECK = [
  { route: '/', name: 'Dashboard / Jogadores' },
  { route: '/campo/real', name: 'Plantel' },
  { route: '/pipeline', name: 'Pipeline' },
  { route: '/calendario', name: 'Calendário' },
  { route: '/jogadores/novo', name: 'Adicionar Jogador' },
  { route: '/preferencias', name: 'Preferências' },
];

test.describe('Accessibility (axe-core)', () => {
  test.use({ storageState: ADMIN_AUTH });

  for (const { route, name } of PAGES_TO_CHECK) {
    test(`${name} (${route}) passes a11y checks`, async ({ page }) => {
      await page.goto(route);
      // Wait for main content to load
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        // Check WCAG 2.1 A and AA
        .withTags(['wcag2a', 'wcag2aa'])
        // color-contrast excluded — intentional design choices, not bugs
        // meta-viewport excluded — Next.js viewport config, not controllable per-page
        .disableRules(['color-contrast', 'meta-viewport'])
        // Exclude known third-party components that we don't control
        .exclude('.cmdk-input') // cmdk command palette
        .analyze();

      // Log violations for debugging (won't fail on warnings)
      if (results.violations.length > 0) {
        console.log(`a11y violations on ${route}:`, JSON.stringify(results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.length,
        })), null, 2));
      }

      // Fail on serious and critical violations only
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      expect(serious, `${serious.length} serious a11y violations on ${route}`).toHaveLength(0);
    });
  }
});
