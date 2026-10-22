import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';

describe('P1-05: Real Playwright Chromium Execution and Evidence Capture', () => {
  let server: http.Server;
  let serverUrl: string;
  let port: number;
  let browserWorker: PlaywrightBrowserWorker;
  const testStagingDir = path.join(process.cwd(), '.tmp', 'test-staging-p1-05');

  beforeAll(async () => {
    // 1. Create a lightweight local HTTP test fixture
    server = http.createServer((req, res) => {
      if (req.url === '/api/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', receivedAt: new Date().toISOString() }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>TraceCase Test Target</title>
        </head>
        <body>
          <h1 id="page-heading">TraceCase Automated Sandbox</h1>
          <input id="test-input" type="text" placeholder="Enter text" />
          <button id="test-submit" onclick="
            const val = document.getElementById('test-input').value;
            document.getElementById('result-output').innerText = 'Processed: ' + val;
            console.log('Action performed: user-submitted ' + val);
            fetch('/api/ping');
          ">Submit Query</button>
          <div id="result-output">Waiting for input</div>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    browserWorker = new PlaywrightBrowserWorker({
      stagingRootDir: testStagingDir,
      defaultActionTimeoutMs: 10_000,
      maxAttemptDurationMs: 30_000,
    });
  });

  afterAll(async () => {
    if (browserWorker) {
      await browserWorker.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up temporary test files
    await fs.rm(testStagingDir, { recursive: true, force: true }).catch(() => {});
  }, 30_000);

  it('launches headless Chromium, executes plan actions, captures evidence, and returns factual receipt', async () => {
    const investigationId = '77777777-7777-4777-8777-777777777777';

    const safeTarget: SafeTargetProfile = {
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Local Chromium Fixture',
      baseUrl: serverUrl,
      allowedOrigins: [serverUrl, `http://localhost:${port}`],
      isSandboxVerified: true,
      environment: 'development',
      hasResetCapability: false,
      hasTestAccountConfigured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: AuthoritativeExperimentPlan = {
      id: '99999999-9999-4999-8999-999999999999',
      investigationId,
      version: 1,
      targetId: safeTarget.id,
      targetUrl: serverUrl,
      allowedOrigins: safeTarget.allowedOrigins,
      preconditions: ['Server is running locally'],
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'Navigate to local sandbox test target',
          toolKind: 'navigate',
          value: serverUrl,
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 8000,
        },
        {
          stepIndex: 2,
          semanticAction: 'Fill query input with reproduction probe',
          toolKind: 'fill_input',
          selector: '#test-input',
          value: 'probe-defect-123',
          tier: 'TIER_3_MUTATING_INTERACTION',
          timeoutMs: 5000,
        },
        {
          stepIndex: 3,
          semanticAction: 'Click submit button to trigger action and fetch',
          toolKind: 'click_button',
          selector: '#test-submit',
          tier: 'TIER_3_MUTATING_INTERACTION',
          timeoutMs: 5000,
        },
        {
          stepIndex: 4,
          semanticAction: 'Read back processed result status',
          toolKind: 'get_text',
          selector: '#result-output',
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: 5000,
        },
      ],
      expectedCorrectBehavior: 'Output contains Processed: probe-defect-123',
      reportedFailureSignature: 'Output fails to update',
      assertions: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          description: 'Processed text is visible',
          kind: 'ENTITY_PRESENCE',
          source: 'DOM_ELEMENT',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          subjectRef: '#result-output',
          operator: 'EXISTS',
          settlingPoint: 'AFTER_NETWORK_IDLE',
        },
      ],
      maxAttempts: 2,
      maxDurationMs: 30000,
      requiresResetHook: false,
      planHash: 'b'.repeat(64),
      createdAt: new Date().toISOString(),
    };

    const receipt = await browserWorker.executeAttempt({
      investigationId,
      attemptNumber: 1,
      plan,
      target: safeTarget,
    });

    // 1. Verify Attempt Execution Receipt Structure
    expect(receipt.investigationId).toBe(investigationId);
    expect(receipt.attemptNumber).toBe(1);
    expect(receipt.completedCleanly).toBe(true);
    expect(receipt.totalDurationMs).toBeGreaterThan(0);
    expect(receipt.startedAt).toBeDefined();
    expect(receipt.finishedAt).toBeDefined();

    // Must NOT contain reproduction verdict (TC-INV-007)
    expect((receipt as any).reproductionVerdict).toBeUndefined();
    expect((receipt as any).verdict).toBeUndefined();

    // 2. Verify Action Receipts
    expect(receipt.actionsExecuted.length).toBe(4);

    const [navStep, fillStep, clickStep, readStep] = receipt.actionsExecuted;
    expect(navStep.status).toBe('SUCCESS');
    expect(navStep.uncertainty).toBe('NONE');

    expect(fillStep.status).toBe('SUCCESS');
    expect(fillStep.uncertainty).toBe('NONE');

    expect(clickStep.status).toBe('SUCCESS');
    expect(clickStep.uncertainty).toBe('NONE');

    expect(readStep.status).toBe('SUCCESS');
    expect(readStep.uncertainty).toBe('NONE');

    // 3. Verify Captured Console Entries
    expect(receipt.captureCoverage.hasConsoleLogs).toBe(true);
    expect(receipt.captureCoverage.consoleStatus).toBe('CAPTURED_WITH_ENTRIES');

    // 4. Verify Network Trace
    expect(receipt.captureCoverage.hasNetworkTrace).toBe(true);
    expect(receipt.captureCoverage.networkStatus).toBe('CAPTURED_WITH_REQUESTS');

    // 5. Verify Video Recording Finalization
    expect(receipt.captureCoverage.videoStatus).toBe('FINALIZED');
    expect(receipt.captureCoverage.hasVideoRecording).toBe(true);
    expect(receipt.captureCoverage.coverageComplete).toBe(true);

    // 6. Verify Staged Files on Disk
    const attemptStagingDir = path.join(testStagingDir, investigationId, 'attempt-1');
    const files = await fs.readdir(attemptStagingDir);
    expect(files).toContain('console-attempt-1.json');
    expect(files).toContain('network-attempt-1.json');

    const consoleContent = JSON.parse(
      await fs.readFile(path.join(attemptStagingDir, 'console-attempt-1.json'), 'utf-8')
    );
    expect(
      consoleContent.some((entry: any) =>
        entry.text.includes('Action performed: user-submitted probe-defect-123')
      )
    ).toBe(true);

    const videoFiles = await fs.readdir(path.join(attemptStagingDir, 'videos'));
    expect(videoFiles.length).toBeGreaterThan(0);
  }, 45_000);
});
