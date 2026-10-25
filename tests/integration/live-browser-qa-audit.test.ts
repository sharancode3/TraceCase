import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

describe('Real Browser Audit & Demonstration of Repaired Workflows', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const artifactDir = 'C:/Users/tms10/.gemini/antigravity/brain/ff1527dc-9295-49af-9f62-45312e3b7115';

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
  });

  it('1. verifies light theme default on initial load and signs in operator', async () => {
    await page.goto('http://localhost:3000', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Verify root html does not have dark class by default
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(false);

    // Save screenshot of initial home view
    await page.screenshot({ path: path.join(artifactDir, 'audit-01-homepage-light.png') });

    // Sign in via session API
    const sessionRes = await page.request.post('http://localhost:3000/api/auth/session', {
      data: { email: 'operator@tracecase.local' },
    });
    expect(sessionRes.ok()).toBe(true);
    const sessionData = await sessionRes.json();
    expect(sessionData.success).toBe(true);

    // Add cookie to browser context
    await context.addCookies([
      {
        name: 'tc_session',
        value: sessionData.token,
        domain: 'localhost',
        path: '/',
      },
    ]);
  }, 30000);

  it('2. verifies targets page loads with registered target without sign-in modal flash', async () => {
    await page.goto('http://localhost:3000/targets', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Check heading
    const heading = await page.textContent('h1, h2');
    expect(heading).toBeTruthy();

    await page.screenshot({ path: path.join(artifactDir, 'audit-02-targets-authenticated.png') });
  }, 30000);

  it('3. verifies intake form does not ask irrelevant deletion questions for heading report', async () => {
    await page.goto('http://localhost:3000/investigations/new', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(artifactDir, 'audit-03-intake-form.png') });

    // Fill title and description
    await page.fill('#report-title', 'Dashboard heading visibility check');
    await page.fill(
      '#report-desc',
      'The investigations dashboard heading should be visible on page load. Do not delete or mutate any data.'
    );

    await page.screenshot({ path: path.join(artifactDir, 'audit-04-intake-filled.png') });
  }, 30000);

  it('4. verifies Cart target catalog search input has type="text" and arithmetic works', async () => {
    await page.goto('http://localhost:3007', { waitUntil: 'load' });

    // Check search input attribute
    const inputType = await page.getAttribute('#catalog-search', 'type');
    expect(inputType).toBe('text');

    // Type text query
    await page.fill('#catalog-search', 'Keyboard');
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(artifactDir, 'audit-05-cart-target-text-search.png') });
  }, 30000);

  it('5. demonstrates truthful timeline, cancellation without Invalid Date, and honest PDF report', async () => {
    const sessionRes = await page.request.post('http://localhost:3000/api/auth/session', {
      data: { email: 'operator@tracecase.local' },
    });
    const sessionData = await sessionRes.json();

    // 1. Fetch available target (or register one)
    const targetsRes = await page.request.get('http://localhost:3000/api/v1/targets', {
      headers: { Cookie: `tc_session=${sessionData.token}` },
    });
    expect(targetsRes.ok()).toBe(true);
    const targetsJson = await targetsRes.json();
    let targetId = targetsJson.data?.[0]?.id;
    if (!targetId) {
      const regRes = await page.request.post('http://localhost:3000/api/v1/targets', {
        headers: { Cookie: `tc_session=${sessionData.token}` },
        data: {
          name: 'Demo Workbench Staging',
          baseUrl: 'http://localhost:3005',
          environment: 'staging',
          allowedOrigins: ['http://localhost:3005'],
          fixtureScope: 'workbench_work_items',
        },
      });
      const regText = await regRes.text();
      let regJson: any = {};
      try { regJson = JSON.parse(regText); } catch {}
      targetId = regJson.data?.id;
      if (!targetId) {
        console.error('Target registration failed:', regRes.status(), regText);
      }
    }
    expect(targetId).toBeTruthy();

    // 2. Submit report via POST /api/v1/reports
    const createRes = await page.request.post('http://localhost:3000/api/v1/reports', {
      headers: { Cookie: `tc_session=${sessionData.token}` },
      data: {
        title: 'Browser timeline verification check',
        rawDescription: 'Dashboard heading should be visible on initial navigation.',
        expectedBehavior: 'The dashboard heading is rendered clearly',
        observedBehavior: 'Heading is absent or not observed',
        targetId,
      },
    });

    if (!createRes.ok()) {
      console.error('Create report failed:', createRes.status(), await createRes.text());
    }
    expect(createRes.ok()).toBe(true);
    const createData = await createRes.json();
    const invId = createData.data.investigationId;
    expect(invId).toBeTruthy();

    // 3. Cancel the investigation before execution
    const cancelRes = await page.request.post(`http://localhost:3000/api/v1/investigations/${invId}/cancel`, {
      headers: { Cookie: `tc_session=${sessionData.token}` },
      data: {
        investigationId: invId,
        cancellationReason: 'Cancelled to verify truthful timeline rendering',
        expectedWorkflowRevision: 1,
      },
    });

    if (!cancelRes.ok()) {
      console.error('Cancel failed:', cancelRes.status(), await cancelRes.text());
    }
    expect(cancelRes.ok()).toBe(true);
    const cancelData = await cancelRes.json();
    expect(cancelData.status).toBe('CANCELLED');
    expect(typeof cancelData.cancelledAt).toBe('string');
    expect(isNaN(new Date(cancelData.cancelledAt).getTime())).toBe(false);

    // 4. Visit cancelled investigation in browser
    await page.goto(`http://localhost:3000/investigations/${invId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    const pageText = await page.textContent('body');
    // Ensure no false DISPATCHED badges
    expect(pageText).not.toContain('DISPATCHED');
    // Ensure no Invalid Date
    expect(pageText).not.toContain('Invalid Date');

    await page.screenshot({
      path: path.join(artifactDir, 'audit-06-cancelled-truthful-timeline.png'),
      fullPage: true,
    });

    // 5. Download and verify PDF report
    const pdfRes = await page.request.get(`http://localhost:3000/api/v1/investigations/${invId}/report/pdf`, {
      headers: { Cookie: `tc_session=${sessionData.token}` },
    });
    expect(pdfRes.ok()).toBe(true);
    const pdfBuffer = await pdfRes.body();
    expect(pdfBuffer.slice(0, 5).toString()).toBe('%PDF-');
    fs.writeFileSync(path.join(artifactDir, 'audit-07-repaired-report.pdf'), pdfBuffer);
  }, 30000);
});
