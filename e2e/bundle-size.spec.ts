// e2e/bundle-size.spec.ts
// Bundle size monitoring — verifies client JS stays within acceptable limits
// Prevents accidental 'use client' bloat from heavy imports (ExcelJS, jsPDF, etc.)
// RELEVANT FILES: scripts/check-bundle-size.sh, playwright.config.ts

import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, 'auth', 'admin.json');

// Maximum total JS transferred for initial page load (in bytes)
const MAX_JS_BYTES = 400 * 1024; // 400 KB

test.describe('Bundle size', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('initial page load JS is under 400KB', async ({ page }) => {
    // Track all JS resource sizes
    let totalJsBytes = 0;

    page.on('response', (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('javascript') || url.endsWith('.js')) {
        const contentLength = parseInt(response.headers()['content-length'] || '0', 10);
        totalJsBytes += contentLength;
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    console.log(`Total JS transferred: ${(totalJsBytes / 1024).toFixed(1)} KB`);
    expect(totalJsBytes).toBeLessThan(MAX_JS_BYTES);
  });
});
