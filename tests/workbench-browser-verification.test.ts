import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createDemoTargetServer } from '../demo-target/server';
import path from 'node:path';

import fs from 'node:fs';
const ARTIFACT_DIR = process.env.TEST_OUTPUT_DIR || path.join(process.cwd(), 'test-results', 'workbench');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
const TEST_SECRET = 'tc-browser-test-secret-2026';

describe('Person 2: Workbench Live Playwright Browser Verification', () => {
  let buggyServer: ReturnType<typeof createDemoTargetServer>;
  let fixedServer: ReturnType<typeof createDemoTargetServer>;
  let buggyUrl: string;
  let fixedUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    // 1. Start buggy demo target server (bugModeActive = true)
    buggyServer = createDemoTargetServer({
      port: 0,
      resetSecret: TEST_SECRET,
      bugModeActive: true,
      buildVersion: 'wb-v1.0.0-buggy',
    });
    const buggyPort = await buggyServer.start(0, '127.0.0.1');
    buggyUrl = `http://127.0.0.1:${buggyPort}`;

    // 2. Start fixed demo target server (bugModeActive = false)
    fixedServer = createDemoTargetServer({
      port: 0,
      resetSecret: TEST_SECRET,
      bugModeActive: false,
      buildVersion: 'wb-v1.0.1-fixed',
    });
    const fixedPort = await fixedServer.start(0, '127.0.0.1');
    fixedUrl = `http://127.0.0.1:${fixedPort}`;

    // 3. Launch headless Chromium
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (buggyServer) await buggyServer.stop();
    if (fixedServer) await fixedServer.stop();
  }, 30000);

  it('verifies initial state, metrics cards, and details inspection in browser', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${buggyUrl}/workbench`);
      await page.waitForSelector('#wb-queue-list');

      // Verify header and build version
      const brand = await page.textContent('.wb-brand-title');
      expect(brand).toContain('TraceCase Workbench');
      expect(brand).toContain('wb-v1.0.0-buggy');

      // Verify metrics cards: 4 total, 2 active, 2 completed, 1 critical
      expect(await page.textContent('#metric-total-val')).toBe('4');
      expect(await page.textContent('#metric-active-val')).toBe('2');
      expect(await page.textContent('#metric-completed-val')).toBe('2');
      expect(await page.textContent('#metric-critical-val')).toBe('1');

      // Verify visible queue count
      expect(await page.textContent('#queue-visible-count')).toBe('4');

      // Inspect details of wb-item-02
      await page.click('[data-item-id="wb-item-02"] [data-action="view-details"]');
      await page.waitForSelector('#wb-detail-content', { state: 'visible' });

      expect(await page.textContent('#detail-id')).toBe('wb-item-02');
      expect(await page.textContent('#detail-title')).toBe('Implement Audit Log Retention Policy');
      expect(await page.textContent('#detail-priority')).toBe('Critical');
      expect(await page.textContent('#detail-owner')).toBe('Alex Murphy');

      // Capture screenshot
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'workbench-initial-state.png') });
    } finally {
      await page.close();
    }
  });

  it('verifies search and status filtering', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${buggyUrl}/workbench`);
      await page.waitForSelector('#wb-queue-list');

      // Filter Active: only wb-item-02 and wb-item-03 visible
      await page.click('#filter-active');
      expect(await page.textContent('#queue-visible-count')).toBe('2');
      expect(await page.isVisible('#wb-item-02')).toBe(true);
      expect(await page.isVisible('#wb-item-03')).toBe(true);
      expect(await page.isVisible('#wb-item-01')).toBe(false);
      expect(await page.isVisible('#wb-item-04')).toBe(false);

      // Filter Completed: only wb-item-01 and wb-item-04 visible
      await page.click('#filter-completed');
      expect(await page.textContent('#queue-visible-count')).toBe('2');
      expect(await page.isVisible('#wb-item-01')).toBe(true);
      expect(await page.isVisible('#wb-item-04')).toBe(true);
      expect(await page.isVisible('#wb-item-02')).toBe(false);
      expect(await page.isVisible('#wb-item-03')).toBe(false);

      // Reset to All
      await page.click('#filter-all');
      expect(await page.textContent('#queue-visible-count')).toBe('4');

      // Search for 'SOC2' -> only wb-item-01 matches
      await page.fill('#wb-search-input', 'SOC2');
      expect(await page.textContent('#queue-visible-count')).toBe('1');
      expect(await page.isVisible('#wb-item-01')).toBe(true);
      expect(await page.isVisible('#wb-item-02')).toBe(false);

      // Clear search
      await page.fill('#wb-search-input', '');
      expect(await page.textContent('#queue-visible-count')).toBe('4');
    } finally {
      await page.close();
    }
  });

  it('verifies deletion cancellation leaves queue intact without mutations', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${buggyUrl}/workbench`);
      await page.waitForSelector('#wb-queue-list');

      // Click delete on wb-item-02
      await page.click('[data-item-id="wb-item-02"] [data-action="delete"]');

      // Dialog must be visible
      await page.waitForSelector('#wb-confirm-modal', { state: 'visible' });
      expect(await page.textContent('#wb-confirm-item-id')).toContain('wb-item-02');

      // Capture screenshot of delete dialog
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'workbench-delete-dialog.png') });

      // Click Cancel
      await page.click('#wb-confirm-cancel-btn');
      await page.waitForSelector('#wb-confirm-modal', { state: 'hidden' });

      // All 4 items remain present
      expect(await page.textContent('#metric-total-val')).toBe('4');
      expect(await page.textContent('#queue-visible-count')).toBe('4');
      expect(await page.isVisible('#wb-item-02')).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('demonstrates buggy build deletion defect: deleting active item removes index 0 (wb-item-01)', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${buggyUrl}/workbench`);
      await page.waitForSelector('#wb-queue-list');

      // 1. Switch to Active filter
      await page.click('#filter-active');
      expect(await page.textContent('#queue-visible-count')).toBe('2');

      // In active view:
      // index 0: wb-item-02
      // index 1: wb-item-03

      // 2. Click Delete on wb-item-02
      await page.click('[data-item-id="wb-item-02"] [data-action="delete"]');
      await page.waitForSelector('#wb-confirm-modal', { state: 'visible' });

      // 3. Confirm Delete
      await page.click('#wb-confirm-delete-btn');
      await page.waitForSelector('#wb-confirm-modal', { state: 'hidden' });

      // In buggy build:
      // Array splice removed index 0 from raw array -> wb-item-01 ("Review Security Compliance Checklist") was deleted!
      // In the server store: wb-item-01 is gone.
      // In the UI: the server returned deletedItemId: 'wb-item-01' because that is what was removed!
      // wb-item-02 was NOT deleted! wb-item-02 is STILL visible in active queue!
      expect(await page.isVisible('#wb-item-02')).toBe(true);
      expect(await page.textContent('#metric-total-val')).toBe('3');

      // Switch to All filter: wb-item-01 is missing, wb-item-02, 03, 04 remain
      await page.click('#filter-all');
      expect(await page.isVisible('#wb-item-01')).toBe(false);
      expect(await page.isVisible('#wb-item-02')).toBe(true);
      expect(await page.isVisible('#wb-item-03')).toBe(true);
      expect(await page.isVisible('#wb-item-04')).toBe(true);

      // Capture screenshot demonstrating the defect
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'workbench-buggy-deletion.png') });

      // 4. Reset fixture via authenticated reset hook
      const resetRes = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': TEST_SECRET,
        },
        body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
      });
      expect(resetRes.status).toBe(200);

      // 5. Click Refresh button on the page -> DOM reconciliation restores wb-item-01
      await page.click('#wb-refresh-btn');
      await page.waitForSelector('#wb-item-01');

      expect(await page.textContent('#metric-total-val')).toBe('4');
      expect(await page.textContent('#metric-active-val')).toBe('2');
      expect(await page.textContent('#metric-completed-val')).toBe('2');
      expect(await page.textContent('#queue-visible-count')).toBe('4');
      expect(await page.isVisible('#wb-item-01')).toBe(true);
      expect(await page.isVisible('#wb-item-02')).toBe(true);

      // Capture screenshot after refresh restoration
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'workbench-restored-refresh.png') });
    } finally {
      await page.close();
    }
  }, 30000);

  it('demonstrates fixed build: deleting active item deletes target by unique ID (wb-item-02)', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${fixedUrl}/workbench`);
      await page.waitForSelector('#wb-queue-list');

      // Verify build version is fixed
      expect(await page.textContent('.wb-brand-title')).toContain('wb-v1.0.1-fixed');

      // 1. Switch to Active filter
      await page.click('#filter-active');
      expect(await page.textContent('#queue-visible-count')).toBe('2');

      // 2. Click Delete on wb-item-02
      await page.click('[data-item-id="wb-item-02"] [data-action="delete"]');
      await page.waitForSelector('#wb-confirm-modal', { state: 'visible' });

      // 3. Confirm Delete
      await page.click('#wb-confirm-delete-btn');
      await page.waitForSelector('#wb-confirm-modal', { state: 'hidden' });

      // In fixed build:
      // wb-item-02 IS deleted!
      expect(await page.isVisible('#wb-item-02')).toBe(false);
      expect(await page.isVisible('#wb-item-03')).toBe(true);
      expect(await page.textContent('#queue-visible-count')).toBe('1');
      expect(await page.textContent('#metric-total-val')).toBe('3');
      expect(await page.textContent('#metric-active-val')).toBe('1');
      expect(await page.textContent('#metric-completed-val')).toBe('2');
      expect(await page.textContent('#metric-critical-val')).toBe('0');

      // Switch to All filter: wb-item-01, 03, 04 remain; wb-item-02 is gone
      await page.click('#filter-all');
      expect(await page.isVisible('#wb-item-01')).toBe(true);
      expect(await page.isVisible('#wb-item-02')).toBe(false);
      expect(await page.isVisible('#wb-item-03')).toBe(true);
      expect(await page.isVisible('#wb-item-04')).toBe(true);

      // Capture screenshot of fixed deletion
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'workbench-fixed-deletion.png') });
    } finally {
      await page.close();
    }
  }, 30000);
});
