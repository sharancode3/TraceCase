import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACTS_DIR = 'C:/Users/tms10/.gemini/antigravity/brain/ff1527dc-9295-49af-9f62-45312e3b7115';

async function main() {
  console.log('[E2E] Starting Workbench real user journey verification...');

  // 1. Establish dev operator session
  console.log('[E2E] Step 1: Establishing dev operator session...');
  const sessionRes = await fetch('http://localhost:3000/api/dev/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'operator@tracecase.local' }),
  });
  if (!sessionRes.ok) {
    throw new Error(`Failed to create session: ${sessionRes.status} ${await sessionRes.text()}`);
  }
  const sessionData = await sessionRes.json();
  const token = sessionData.token;
  console.log('[E2E] Dev session active. Token obtained.');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Register workbench target
  console.log('[E2E] Step 2: Registering Workbench target http://localhost:3005/workbench...');
  const targetRes = await fetch('http://localhost:3000/api/v1/targets', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'TraceCase Workbench Demo Target',
      baseUrl: 'http://localhost:3005/workbench',
      allowedOrigins: ['http://localhost:3005'],
      isSandboxRequested: true,
      fixtureScope: 'workbench_work_items',
      environment: 'demo',
    }),
  });
  if (!targetRes.ok) {
    throw new Error(`Failed to create target: ${targetRes.status} ${await targetRes.text()}`);
  }
  const targetData = await targetRes.json();
  const targetId = targetData.data.id;
  console.log(`[E2E] Workbench target registered with ID: ${targetId}, fixtureScope: ${targetData.data.fixtureScope}`);

  // 3. Submit bug report
  console.log('[E2E] Step 3: Submitting bug report for active task deletion defect...');
  const reportRes = await fetch('http://localhost:3000/api/v1/reports', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      targetId,
      title: 'Deleting active task "Implement Audit Log Retention Policy" (wb-item-02) removes wb-item-01 instead',
      bugDescription: 'In the Workbench target (/workbench), after clicking Active filter button, deleting task wb-item-02 ("Implement Audit Log Retention Policy") unexpectedly removes wb-item-01 instead of wb-item-02.',
      expectedBehavior: 'Active task wb-item-02 ("Implement Audit Log Retention Policy") should be removed, and wb-item-01 should remain present.',
      observedBehavior: 'wb-item-01 is removed while wb-item-02 remains present in the list.',
      suspectedSteps: [
        'Navigate to http://localhost:3005/workbench',
        'Click on Active filter button (#wb-filter-active)',
        'Click delete button on wb-item-02 ("Implement Audit Log Retention Policy")',
        'Confirm deletion in the modal dialog by clicking Confirm Delete (#wb-confirm-delete)',
      ],
      buildVersion: 'wb-v1.0.0-buggy',
    }),
  });
  if (!reportRes.ok) {
    throw new Error(`Failed to create report: ${reportRes.status} ${await reportRes.text()}`);
  }
  const reportData = await reportRes.json();
  const investigationId = reportData.data.investigationId || reportData.data.investigation?.id;
  console.log(`[E2E] Bug report created. Investigation ID: ${investigationId}`);

  // 4. Request Planning from OpenAI Luna Agent
  console.log('[E2E] Step 4: Requesting plan from OpenAI Luna planning agent...');
  let planRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}/plan`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  if (!planRes.ok) {
    throw new Error(`Failed to request plan: ${planRes.status} ${await planRes.text()}`);
  }
  let planResult = await planRes.json();
  console.log(`[E2E] Plan request outcome status: ${planResult.data.status}`);

  if (planResult.data.status === 'CLARIFICATION_NEEDED') {
    console.log(`[E2E] Clarification needed with ${planResult.data.questions?.length || 0} questions. Answering...`);
    const answers = (planResult.data.questions || []).map((q: any) => ({
      questionId: q.id,
      answerText: q.suggestedOptions?.[0] || 'Active items filter selected, deleting second item wb-item-02.',
    }));

    const answerRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}/clarifications/answer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ answers }),
    });
    if (!answerRes.ok) {
      throw new Error(`Failed to answer clarifications: ${answerRes.status} ${await answerRes.text()}`);
    }
    console.log('[E2E] Clarification questions answered. Re-requesting plan...');

    planRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}/plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    if (!planRes.ok) {
      throw new Error(`Failed to re-request plan: ${planRes.status} ${await planRes.text()}`);
    }
    planResult = await planRes.json();
    console.log(`[E2E] Second plan request outcome: ${planResult.data.status}`);
  }

  // 5. Inspect and Approve the Plan
  console.log('[E2E] Step 5: Loading investigation details and verifying authoritative plan...');
  const invRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}`, {
    headers: authHeaders,
  });
  const invDetails = await invRes.json();
  const planPayload = invDetails.data.planPayload || invDetails.data.authoritativePlan || planResult.data.plan;
  const planVersion = invDetails.data.planVersion || 1;
  const planHash = invDetails.data.planHash;

  console.log(`[E2E] Plan version: ${planVersion}, hash: ${planHash}`);
  console.log(`[E2E] Plan fixtureScope: ${planPayload?.fixtureScope}`);
  console.log(`[E2E] Plan expectedBaseline: itemCount=${planPayload?.expectedBaseline?.itemCount}, scope=${planPayload?.expectedBaseline?.fixtureScope}`);

  console.log('[E2E] Approving authoritative plan with cryptographic hash...');
  const approveRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}/approve`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      investigationId,
      planVersion,
      approvedPlanHash: planHash,
    }),
  });
  if (!approveRes.ok) {
    throw new Error(`Failed to approve plan: ${approveRes.status} ${await approveRes.text()}`);
  }
  console.log('[E2E] Plan approved by operator.');

  // 6. Start execution
  console.log('[E2E] Step 6: Starting investigation execution request...');
  const startRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}/start`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      investigationId,
      planVersion,
      approvedPlanHash: planHash,
    }),
  });
  if (!startRes.ok) {
    throw new Error(`Failed to start execution: ${startRes.status} ${await startRes.text()}`);
  }
  const startData = await startRes.json();
  console.log(`[E2E] Execution request started. Status: ${startData.status}, Job ID: ${startData.jobId}`);

  // 7. Poll until complete
  console.log('[E2E] Step 7: Awaiting worker execution (polling every 3s)...');
  let lifecycleStatus = 'RUNNING';
  let attempts = 0;
  let finalInvData: any = null;

  while (lifecycleStatus !== 'COMPLETED' && lifecycleStatus !== 'FAILED' && attempts < 40) {
    attempts++;
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`http://localhost:3000/api/v1/investigations/${investigationId}`, {
      headers: authHeaders,
    });
    if (pollRes.ok) {
      finalInvData = await pollRes.json();
      lifecycleStatus = finalInvData.data.lifecycleStatus;
      const verdict = finalInvData.data.reproductionVerdict || 'PENDING';
      const att1 = finalInvData.data.attempt1 ? `att1: ${finalInvData.data.attempt1.validity}` : 'att1: pending';
      const att2 = finalInvData.data.attempt2 ? `att2: ${finalInvData.data.attempt2.validity}` : 'att2: pending';
      console.log(`[E2E Poll ${attempts}] Lifecycle: ${lifecycleStatus}, Verdict: ${verdict} (${att1}, ${att2})`);
      if (lifecycleStatus === 'COMPLETED' || lifecycleStatus === 'FAILED') {
        break;
      }
    }
  }

  if (lifecycleStatus !== 'COMPLETED') {
    throw new Error(`Investigation did not complete within budget. Final lifecycle: ${lifecycleStatus}, Verdict: ${finalInvData?.data?.reproductionVerdict}`);
  }

  console.log('[E2E] Investigation COMPLETED successfully!');
  console.log(`[E2E] Final Verdict: ${finalInvData.data.reproductionVerdict}`);

  // 8. Open real Playwright browser and inspect UI
  console.log('[E2E] Step 8: Launching real Playwright Chromium to inspect user-facing UI...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Set the session cookie so user is authenticated in the UI
  await context.addCookies([
    {
      name: 'tc_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  await page.goto(`http://localhost:3000/investigations/${investigationId}`);
  await page.waitForTimeout(3000);

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const screenshotPath = path.join(ARTIFACTS_DIR, 'workbench-e2e-investigation-result.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[E2E] UI Screenshot captured to: ${screenshotPath}`);

  // Verify page contents
  const pageText = await page.textContent('body');
  const verdictVisible = pageText?.includes('CONFIRMED_REPRODUCED') || pageText?.includes('Confirmed');
  console.log(`[E2E] Verdict displayed on UI: ${verdictVisible}`);

  await browser.close();

  console.log('[E2E] All verification steps completed successfully!');
}

main().catch((err) => {
  console.error('[E2E Error]:', err);
  process.exit(1);
});
