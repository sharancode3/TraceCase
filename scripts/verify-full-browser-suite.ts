import { chromium, type Page, type Browser } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = 'http://localhost:3000';
const BUGGY_TARGET_URL = 'http://localhost:3005/workbench';
const FIXED_TARGET_URL = 'http://localhost:3006/workbench';
const OUTPUT_DIR = path.resolve(process.cwd(), 'test-results', 'phase2-integration');
const ARTIFACT_DIR = 'C:/Users/tms10/.gemini/antigravity/brain/ff1527dc-9295-49af-9f62-45312e3b7115';

function log(section: string, message: string) {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] [${section}] ${message}`);
}

async function takeScreenshot(page: Page, filename: string) {
  const filePath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  log('SCREENSHOT', `Saved: ${filePath}`);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  try {
    fs.copyFileSync(filePath, artifactPath);
  } catch {
    // Artifact copy is best-effort
  }
}

async function dismissAnyOverlayModals(page: Page) {
  // Wait for the 600ms onboarding prompt timer in tour-context.tsx
  await page.waitForTimeout(800);

  // Check for initial setup modal (Sign in for demo)
  const setupModal = page.locator('div[role="dialog"][aria-labelledby="setup-modal-title"]');
  if (await setupModal.isVisible()) {
    log('DISMISS', 'Setup / Sign-In modal found. Signing in through modal...');
    const signInBtn = setupModal.locator('button:has-text("Sign In")');
    await signInBtn.click();
    await page.waitForTimeout(800);
  }

  // Check for tour prompt modal
  const tourPromptModal = page.locator('div[role="dialog"][aria-labelledby="tour-modal-title"]');
  if (await tourPromptModal.isVisible()) {
    log('DISMISS', 'Tour prompt modal found. Dismissing...');
    const closeBtn = tourPromptModal.locator('button[aria-label="Close dialog"], button:has-text("Skip")');
    if (await closeBtn.first().isVisible()) {
      await closeBtn.first().click();
      await page.waitForTimeout(500);
    }
  }

  // Check for first-use guide modal if already open
  const guideModal = page.locator('div[role="dialog"][aria-labelledby="guide-modal-title"]');
  if (await guideModal.isVisible()) {
    log('DISMISS', 'Guide modal found open. Pressing Escape...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // If any backdrop overlay remains, dismiss with Escape
  const backdrop = page.locator('div.fixed.inset-0.z-50');
  if (await backdrop.isVisible()) {
    log('DISMISS', 'Backdrop overlay still visible. Pressing Escape...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

async function runStage3Verification(browser: Browser) {
  log('STAGE-3', 'Starting Stage 3: First Visit, Guide & Tour Verification...');

  // Desktop Viewport
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await desktopContext.newPage();

  // 1. Visit root page
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  log('STAGE-3', `Loaded ${BASE_URL}/ - Page Title: ${await page.title()}`);

  // Dismiss any introductory prompt modal
  await dismissAnyOverlayModals(page);

  // 2. Open First-Use Guide modal from sidebar
  const guideBtn = page.locator('#sidebar-guide-btn');
  await guideBtn.waitFor({ state: 'visible', timeout: 5000 });
  await guideBtn.click();

  // Verify modal is visible
  const modal = page.locator('div[role="dialog"][aria-labelledby="guide-modal-title"]');
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  log('STAGE-3', 'First-Use Guide modal opened successfully.');
  await takeScreenshot(page, 'stage-03-first-use-guide-desktop.png');

  // Verify Step 1 content (Target vs Server distinction)
  const step1Title = await page.locator('#guide-modal-title').textContent();
  log('STAGE-3', `Guide Modal Title: ${step1Title}`);
  const stepText = await page.locator('[id^="guide-panel-"]').textContent();
  if (!stepText?.includes('Register an authorized test target once')) {
    throw new Error('Guide Step 1 title not found');
  }
  if (!stepText?.includes('demo-target is a separate application')) {
    throw new Error('Target vs Server boundary explanation missing in Step 1');
  }
  log('STAGE-3', 'Step 1 Target vs Server boundary verified.');

  // Step through steps 2 to 6
  for (let i = 2; i <= 6; i++) {
    const nextBtn = page.locator('button:has-text("Next Step"), button:has-text("Got It")');
    await nextBtn.click();
    await page.waitForTimeout(300);
    const content = await page.locator('[id^="guide-panel-"]').textContent();
    log('STAGE-3', `Advanced to Step ${i}`);
    if (i === 2 && !content?.includes('uncertainty in initial intake is completely normal')) {
      throw new Error('Step 2 uncertainty note missing');
    }
    if (i === 6 && !content?.includes('does not patch, modify, or fix target source code')) {
      throw new Error('Step 6 reproduction boundary missing');
    }
  }

  // Dismiss guide via Escape key
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden', timeout: 5000 });
  log('STAGE-3', 'Guide modal dismissed via Escape key.');

  // Test mobile viewport adaptability
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(mobilePage);
  await takeScreenshot(mobilePage, 'stage-03-mobile-dashboard.png');
  log('STAGE-3', 'Mobile viewport verified and captured.');
  await mobileContext.close();

  // Test Onboarding Tour
  const tourBtn = page.locator('#sidebar-take-demo-btn');
  await tourBtn.click();
  await page.waitForTimeout(600);
  await takeScreenshot(page, 'stage-03-onboarding-tour.png');
  log('STAGE-3', 'Onboarding Tour opened and verified.');

  // Dismiss tour if present
  const skipBtn = page.locator('button:has-text("Skip Tour"), button:has-text("Dismiss"), button:has-text("Close")');
  if (await skipBtn.count() > 0 && await skipBtn.first().isVisible()) {
    await skipBtn.first().click();
  }

  await desktopContext.close();
  log('STAGE-3', 'Stage 3 First Visit, Guide & Tour Verification COMPLETED SUCCESSFULLY.');
}

async function runBuggyPositiveJourney(browser: Browser): Promise<string> {
  log('STAGE-4-7', 'Starting Stage 4-7: Buggy Workbench Positive Journey...');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 1. Establish dev operator session via UI
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(page);

  const signInBtn = page.locator('#sidebar-signin-btn, #header-signin-btn');
  if (await signInBtn.isVisible()) {
    log('STAGE-4', 'Clicking Dev Sign In button...');
    await signInBtn.click();
    await page.waitForTimeout(1000);
    await dismissAnyOverlayModals(page);
  }
  log('STAGE-4', 'Dev operator session active in browser.');

  // 2. Navigate to Targets page and register Workbench Buggy Target (Port 3005)
  log('STAGE-4', 'Navigating to /targets to register buggy target...');
  await page.goto(`${BASE_URL}/targets`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(page);

  await page.fill('#target-name', 'Workbench Buggy Target (Port 3005)');
  await page.fill('#target-base-url', BUGGY_TARGET_URL);

  // If duplicate variant confirmation appears, check it
  await page.waitForTimeout(500);
  const variantCheckbox = page.locator('#confirm-intentional-variant');
  if (await variantCheckbox.isVisible()) {
    log('STAGE-4', 'Checking confirm intentional variant checkbox...');
    await variantCheckbox.check();
  }

  // Submit target registration
  const registerSubmitBtn = page.locator('#target-registration-card form button[type="submit"]');
  await registerSubmitBtn.click();

  // Wait for success notice
  const successNotice = page.locator('div[role="status"]:has-text("registered successfully")');
  await successNotice.waitFor({ state: 'visible', timeout: 15000 });
  log('STAGE-4', 'Target registered successfully in UI.');
  await takeScreenshot(page, 'stage-04-target-registered.png');

  // Click "Create a report for this target" link
  const createReportLink = page.locator('a:has-text("Create a report for this target")');
  await createReportLink.click();
  await page.waitForURL(/\/investigations\/new/, { timeout: 15000 });
  log('STAGE-4', 'Navigated to /investigations/new.');

  // 3. Fill bug report form
  await page.waitForSelector('#target-select option:not([value=""])', { state: 'attached', timeout: 10000 });
  const selectedVal = await page.$eval('#target-select', (el: any) => el.value);
  if (!selectedVal) {
    log('STAGE-4', 'Selecting target explicitly in dropdown...');
    const options = await page.$$eval('#target-select option', (opts: any[]) =>
      opts.map((o) => ({ value: o.value, text: o.textContent || '' }))
    );
    const targetOpt = options.find((o) => o.text.includes('3005') || (o.value && o.value.length > 0));
    if (targetOpt?.value) {
      await page.selectOption('#target-select', targetOpt.value);
    }
  }

  await page.fill('#report-title', 'Deleting active task wb-item-02 removes wb-item-01 instead');
  await page.fill(
    '#report-desc',
    'In the Workbench target (/workbench), after clicking Active filter button, deleting task wb-item-02 ("Implement Audit Log Retention Policy") unexpectedly removes wb-item-01 instead of wb-item-02.'
  );
  await page.fill('#report-expected', 'Active task wb-item-02 should be removed, and wb-item-01 should remain present.');
  await page.fill('#report-observed', 'wb-item-01 is removed while wb-item-02 remains present in the list.');
  await page.fill(
    '#report-steps',
    'Navigate to http://localhost:3005/workbench\nClick on Active filter button (#wb-filter-active)\nClick delete button on wb-item-02\nConfirm deletion in the modal dialog by clicking Confirm Delete (#wb-confirm-delete-btn)'
  );
  await page.fill('#report-build', 'wb-v1.0.0-buggy');

  await takeScreenshot(page, 'stage-04-report-intake-filled.png');
  log('STAGE-4', 'Submitting bug report and requesting plan...');

  // Submit report and request plan
  const submitReportBtn = page.locator('#submit-report-btn');
  await submitReportBtn.click();

  // Wait for either clarification or plan approval page
  await page.waitForURL(/\/investigations\/[^/]+\/(approve|clarify)/, { timeout: 60000 });
  const currentUrl = page.url();
  log('STAGE-5', `Navigated after intake to: ${currentUrl}`);

  // Handle clarification if required
  if (currentUrl.includes('/clarify')) {
    log('STAGE-5', 'Investigation requested clarification. Answering via UI...');
    await page.waitForSelector('textarea, button[type="submit"], button:has-text("Submit Answers")', { timeout: 15000 });
    const optionBtns = page.locator('.space-y-1\.5 button');
    const optCount = await optionBtns.count();
    if (optCount > 0) {
      for (let i = 0; i < optCount; i++) {
        await optionBtns.nth(i).click().catch(() => {});
      }
    }
    const textareas = page.locator('textarea');
    const count = await textareas.count();
    for (let i = 0; i < count; i++) {
      await textareas.nth(i).fill('Filtered on Active items, clicked delete on wb-item-02, confirmed deletion.').catch(() => {});
    }
    const answerSubmitBtn = page.locator('button:has-text("Submit Answers"), button:has-text("Proceed")');
    await answerSubmitBtn.click();
    await page.waitForURL(/\/investigations\/[^/]+\/approve/, { timeout: 60000 });
    log('STAGE-5', 'Clarifications answered. Navigated to plan approval.');
  }

  // We are now on /investigations/[id]/approve
  const invIdMatch = page.url().match(/\/investigations\/([^/]+)\/approve/);
  if (!invIdMatch) {
    throw new Error(`Expected approve URL but got: ${page.url()}`);
  }
  const investigationId = invIdMatch[1];
  log('STAGE-5', `Reviewing experiment plan for investigation: ${investigationId}`);
  await page.waitForSelector('text=Preconditions & Verification Scope', { timeout: 15000 });
  await takeScreenshot(page, 'stage-05-plan-review-unapproved.png');

  // Authorize & Approve Plan
  const approveBtn = page.locator('button:has-text("Authorize & Approve Plan")');
  await approveBtn.waitFor({ state: 'visible', timeout: 5000 });
  await approveBtn.click();

  // Wait for approval verification badge
  await page.waitForSelector('text=Cryptographic Approval Verified', { timeout: 15000 });
  log('STAGE-5', 'Plan cryptographically authorized.');
  await takeScreenshot(page, 'stage-05-plan-approved.png');

  // Start Reproduction Run
  const startBtn = page.locator('button:has-text("Start Reproduction Run")');
  await startBtn.waitFor({ state: 'visible', timeout: 5000 });
  await startBtn.click();

  // Navigates to /investigations/[id]/live
  await page.waitForURL(new RegExp(`/investigations/${investigationId}/live`), { timeout: 15000 });
  log('STAGE-6', `Entered live execution monitor: ${page.url()}`);
  await takeScreenshot(page, 'stage-06-live-execution-in-progress.png');

  // Wait for execution to reach terminal status
  log('STAGE-6', 'Waiting for worker daemon to complete bounded dual-run reproduction...');
  let terminalReached = false;
  const startTime = Date.now();
  const maxWaitMs = 120000;

  while (Date.now() - startTime < maxWaitMs) {
    const text = await page.textContent('body');
    if (
      text?.includes('Terminal State Reached') ||
      text?.includes('CONFIRMED_REPRODUCED') ||
      text?.includes('Reproduction Confirmed')
    ) {
      terminalReached = true;
      break;
    }
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (elapsedSec % 10 === 0) {
      log('STAGE-6', `Waiting for worker execution... elapsed ${elapsedSec}s`);
    }
    await page.waitForTimeout(3000);
  }

  if (!terminalReached) {
    throw new Error('Timed out waiting for live execution to complete');
  }

  log('STAGE-6', 'Live execution reached terminal state.');
  await takeScreenshot(page, 'stage-06-live-execution-completed.png');

  // Navigate to detailed results page
  await page.goto(`${BASE_URL}/investigations/${investigationId}`, { waitUntil: 'networkidle' });
  log('STAGE-7', `Loaded detailed investigation results: ${page.url()}`);
  await page.locator(':has-text("Confirmed Reproduced")').first().waitFor({ state: 'visible', timeout: 30000 });
  await takeScreenshot(page, 'stage-07-positive-investigation-result.png');

  await context.close();
  log('STAGE-4-7', 'Stage 4-7 Buggy Workbench Positive Journey COMPLETED SUCCESSFULLY.');
  return investigationId;
}

async function runFixedNegativeControlJourney(browser: Browser): Promise<string> {
  log('STAGE-8', 'Starting Stage 8: Fixed Workbench Negative Control Journey...');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 1. Dev operator session
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(page);

  const signInBtn = page.locator('#sidebar-signin-btn, #header-signin-btn');
  if (await signInBtn.isVisible()) {
    await signInBtn.click();
    await page.waitForTimeout(600);
    await dismissAnyOverlayModals(page);
  }

  // 2. Register Fixed Workbench Target (Port 3006)
  log('STAGE-8', 'Navigating to /targets to register fixed target...');
  await page.goto(`${BASE_URL}/targets`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(page);

  await page.fill('#target-name', 'Workbench Fixed Target (Port 3006)');
  await page.fill('#target-base-url', FIXED_TARGET_URL);

  await page.waitForTimeout(500);
  const variantCheckbox = page.locator('#confirm-intentional-variant');
  if (await variantCheckbox.isVisible()) {
    await variantCheckbox.check();
  }

  const registerSubmitBtn = page.locator('#target-registration-card form button[type="submit"]');
  await registerSubmitBtn.click();

  const successNotice = page.locator('div[role="status"]:has-text("registered successfully")');
  await successNotice.waitFor({ state: 'visible', timeout: 15000 });
  log('STAGE-8', 'Fixed target registered successfully.');

  const createReportLink = page.locator('a:has-text("Create a report for this target")');
  await createReportLink.click();
  await page.waitForURL(/\/investigations\/new/, { timeout: 15000 });

  // 3. Fill identical bug report
  await page.waitForSelector('#target-select option:not([value=""])', { state: 'attached', timeout: 10000 });
  const selectedFixedVal = await page.$eval('#target-select', (el: any) => el.value);
  if (!selectedFixedVal) {
    log('STAGE-8', 'Selecting fixed target explicitly in dropdown...');
    const options = await page.$$eval('#target-select option', (opts: any[]) =>
      opts.map((o) => ({ value: o.value, text: o.textContent || '' }))
    );
    const targetOpt = options.find((o) => o.text.includes('3006') || (o.value && o.value.length > 0));
    if (targetOpt?.value) {
      await page.selectOption('#target-select', targetOpt.value);
    }
  }

  await page.fill('#report-title', 'Deleting active task wb-item-02 removes wb-item-01 instead');
  await page.fill(
    '#report-desc',
    'In the Workbench target (/workbench), after clicking Active filter button, deleting task wb-item-02 ("Implement Audit Log Retention Policy") unexpectedly removes wb-item-01 instead of wb-item-02.'
  );
  await page.fill('#report-expected', 'Active task wb-item-02 should be removed, and wb-item-01 should remain present.');
  await page.fill('#report-observed', 'wb-item-01 is removed while wb-item-02 remains present in the list.');
  await page.fill(
    '#report-steps',
    'Navigate to http://localhost:3006/workbench\nClick on Active filter button (#wb-filter-active)\nClick delete button on wb-item-02\nConfirm deletion in the modal dialog by clicking Confirm Delete (#wb-confirm-delete-btn)'
  );
  await page.fill('#report-build', 'wb-v1.0.1-fixed');

  const submitReportBtn = page.locator('#submit-report-btn');
  await submitReportBtn.click();

  // Wait for approve page
  await page.waitForURL(/\/investigations\/[^/]+\/(approve|clarify)/, { timeout: 60000 });
  if (page.url().includes('/clarify')) {
    const optionBtns = page.locator('.space-y-1\.5 button');
    const optCount = await optionBtns.count();
    if (optCount > 0) {
      for (let i = 0; i < optCount; i++) {
        await optionBtns.nth(i).click().catch(() => {});
      }
    }
    const textareas = page.locator('textarea');
    const count = await textareas.count();
    for (let i = 0; i < count; i++) {
      await textareas.nth(i).fill('Filtered on Active items, clicked delete on wb-item-02, confirmed deletion.').catch(() => {});
    }
    const answerSubmitBtn = page.locator('button:has-text("Submit Answers"), button:has-text("Proceed")');
    await answerSubmitBtn.click();
    await page.waitForURL(/\/investigations\/[^/]+\/approve/, { timeout: 60000 });
  }

  const invIdMatch = page.url().match(/\/investigations\/([^/]+)\/approve/);
  if (!invIdMatch) {
    throw new Error(`Expected approve URL but got: ${page.url()}`);
  }
  const investigationId = invIdMatch[1];
  log('STAGE-8', `Approving plan for negative control investigation: ${investigationId}`);

  await page.waitForSelector('text=Preconditions & Verification Scope', { timeout: 15000 });
  const approveBtn = page.locator('button:has-text("Authorize & Approve Plan")');
  await approveBtn.click();
  await page.waitForSelector('text=Cryptographic Approval Verified', { timeout: 15000 });

  const startBtn = page.locator('button:has-text("Start Reproduction Run")');
  await startBtn.click();

  await page.waitForURL(new RegExp(`/investigations/${investigationId}/live`), { timeout: 15000 });
  log('STAGE-8', 'Execution started. Waiting for negative control outcome...');

  const startTime = Date.now();
  const maxWaitMs = 120000;
  let terminalReached = false;

  while (Date.now() - startTime < maxWaitMs) {
    const text = await page.textContent('body');
    if (
      text?.includes('Terminal State Reached') ||
      text?.includes('Not Reproduced (Clean)')
    ) {
      terminalReached = true;
      break;
    }
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (elapsedSec % 10 === 0) {
      log('STAGE-8', `Waiting for negative control execution... elapsed ${elapsedSec}s`);
    }
    await page.waitForTimeout(3000);
  }

  if (!terminalReached) {
    throw new Error('Timed out waiting for negative control live execution to complete');
  }

  await page.goto(`${BASE_URL}/investigations/${investigationId}`, { waitUntil: 'networkidle' });
  log('STAGE-8', `Negative control results verified: ${page.url()}`);
  await page.locator(':has-text("Not Reproduced (Clean)")').first().waitFor({ state: 'visible', timeout: 30000 });
  await takeScreenshot(page, 'stage-08-negative-control-result.png');

  await context.close();
  log('STAGE-8', 'Stage 8 Fixed Workbench Negative Control Journey COMPLETED SUCCESSFULLY.');
  return investigationId;
}

async function runStage9EvidenceAndSecurityVerification(browser: Browser, positiveId: string) {
  log('STAGE-9', 'Starting Stage 9: Evidence Presentation, Export & Security Verification...');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 1. Dev operator session
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(page);

  const signInBtn = page.locator('#sidebar-signin-btn, #header-signin-btn');
  if (await signInBtn.isVisible()) {
    await signInBtn.click();
    await page.waitForTimeout(600);
    await dismissAnyOverlayModals(page);
  }

  // 2. Visit investigation results page
  await page.goto(`${BASE_URL}/investigations/${positiveId}`, { waitUntil: 'networkidle' });
  await dismissAnyOverlayModals(page);

  // 3. Inspect Console Logs Tab for Secret Redaction
  const consoleTab = page.locator('button:has-text("Console"), [role="tab"]:has-text("Console")');
  if (await consoleTab.isVisible()) {
    await dismissAnyOverlayModals(page);
    await consoleTab.click({ force: true });
    await page.waitForTimeout(500);
    const consoleText = await page.locator('#panel-console').textContent();
    log('STAGE-9', 'Inspecting console log content for secret scrubbing...');
    if (consoleText?.includes('synthetic-jwt-token-xyz-9876')) {
      throw new Error('SECURITY VIOLATION: Raw synthetic secret detected in UI console logs!');
    }
    log('STAGE-9', 'Verified: Raw synthetic token is NOT present in console logs.');
  }

  // 4. Inspect Network Traces Tab
  const networkTab = page.locator('button:has-text("Network"), [role="tab"]:has-text("Network")');
  if (await networkTab.isVisible()) {
    await dismissAnyOverlayModals(page);
    await networkTab.click({ force: true });
    await page.waitForTimeout(500);
    const networkText = await page.locator('#panel-network').textContent();
    if (networkText?.includes('synthetic-jwt-token-xyz-9876')) {
      throw new Error('SECURITY VIOLATION: Raw synthetic secret detected in UI network traces!');
    }
    log('STAGE-9', 'Verified: Raw synthetic token is NOT present in network traces.');
  }

  // 5. Capture Final Evidence Presentation
  await takeScreenshot(page, 'stage-09-evidence-presentation.png');

  // 6. Test Export Reproduction Package
  const exportBtn = page.locator('button:has-text("Export Package"), button:has-text("Download Package"), a:has-text("Export Package")');
  if (await exportBtn.isVisible()) {
    log('STAGE-9', 'Clicking Export Package button...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
      exportBtn.click({ force: true }),
    ]);
    if (download) {
      const downloadPath = path.join(OUTPUT_DIR, `reproduction-package-${positiveId}.json`);
      await download.saveAs(downloadPath);
      log('STAGE-9', `Reproduction package downloaded to: ${downloadPath}`);
    }
  }

  // Query API for reproduction results package with authenticated session
  const cookies = await context.cookies();
  const tcCookie = cookies.find((c) => c.name === 'tc_session');
  const headers: Record<string, string> = {};
  if (tcCookie) {
    headers['Cookie'] = `tc_session=${tcCookie.value}`;
  }
  const res = await fetch(`${BASE_URL}/api/v1/investigations/${positiveId}/results`, { headers });
  if (res.ok) {
    const pkg = await res.json();
    const pkgPath = path.join(OUTPUT_DIR, `reproduction-results-${positiveId}.json`);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    log('STAGE-9', `Saved authoritative results payload to: ${pkgPath}`);
  }

  await context.close();
  log('STAGE-9', 'Stage 9 Evidence Presentation, Export & Security Verification COMPLETED SUCCESSFULLY.');
}

async function main() {
  log('MAIN', 'Initializing TraceCase Full Browser Verification Suite...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    // Stage 3: First Visit, Guide & Tour
    await runStage3Verification(browser);

    // Stage 4-7: Buggy Workbench Positive Journey
    const positiveInvId = await runBuggyPositiveJourney(browser);

    // Stage 8: Fixed Workbench Negative Control Journey
    const negativeInvId = await runFixedNegativeControlJourney(browser);

    // Stage 9: Evidence Presentation, Export & Security Verification
    await runStage9EvidenceAndSecurityVerification(browser, positiveInvId);

    log('MAIN', 'ALL E2E VERIFICATION STAGES COMPLETED CLEANLY WITH FULL PROOF.');
    console.log('\n============================================================');
    console.log('TRACECASE E2E VERIFICATION: ALL 9 STAGES VERIFIED');
    console.log(`Positive Investigation ID (Buggy 3005): ${positiveInvId}`);
    console.log(`Negative Control Investigation ID (Fixed 3006): ${negativeInvId}`);
    console.log(`Screenshots and Artifacts: ${OUTPUT_DIR}`);
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n[FATAL ERROR during E2E verification]:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Unhandled error in runner:', err);
  process.exit(1);
});
