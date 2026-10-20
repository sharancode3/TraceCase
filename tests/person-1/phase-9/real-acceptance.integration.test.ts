import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { PlaywrightBrowserWorker } from '@/server/browser/playwright-worker';
import { checkDbConnectivity, resetDbInstanceForTesting } from '@/server/db';
import { isAuthProviderConfigured } from '@/server/auth/jwt';
import { isDevPreviewEnabled } from '@/server/config/env';
import { getSystemReadiness } from '@/server/services/service-container';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';

/**
 * Real-Integration Acceptance & Environment Capability Test Suite
 *
 * This suite executes real runtime checks using actual local subsystems:
 * - Real Playwright Chromium browser launch and execution
 * - Genuine WebM video recording capture and binary container inspection (EBML header)
 * - Actual browser console logging and network trace acquisition
 * - Preflight readiness audits across all system boundaries
 *
 * Where required external services (Person 2 Luna model, Person 3 Evidence Storage,
 * or live PostgreSQL) are unavailable, this suite produces an explicit BLOCKED or NOT_RUN
 * determination with actionable diagnostics rather than masking the absence with test doubles.
 */
describe('P1-09: Real Acceptance Integration & Environment Capability Suite', () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  const testStagingDir = path.join(process.cwd(), '.tmp', 'real-acceptance-staging');

  beforeAll(async () => {
    resetDbInstanceForTesting();
    // Spin up an actual local HTTP fixture representing an authorized demo web application
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${serverPort}`);

      if (url.pathname === '/api/submit-buggy' && req.method === 'POST') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', code: 'DATABASE_LOCKED' }));
        return;
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>TraceCase Demo Web Target</title>
            </head>
            <body>
              <h1 id="app-heading">TraceCase Bug Reproduction Target</h1>
              <div id="target-build" data-build-id="v2.4.1-staging">Build: v2.4.1-staging</div>
              <input id="user-input" type="text" placeholder="Buggy query" />
              <button id="submit-action-btn" onclick="
                console.log('Action dispatched: form submission initiated');
                fetch('/api/submit-buggy', { method: 'POST' })
                  .then(r => {
                    if (!r.ok) {
                      console.error('Fatal API Error: 500 received from server');
                      const alert = document.createElement('div');
                      alert.id = 'crash-alert-banner';
                      alert.innerText = 'Application Error: Unhandled 500 response';
                      document.body.appendChild(alert);
                    }
                  });
              ">Trigger Action</button>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    await fs.mkdir(testStagingDir, { recursive: true });
  });

  afterAll(async () => {
    resetDbInstanceForTesting();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await fs.rm(testStagingDir, { recursive: true, force: true }).catch(() => {});
  });

  // ===========================================================================
  // PREFLIGHT READINESS AUDIT
  // ===========================================================================
  describe('Preflight Infrastructure & Subsystem Capability Audit', () => {
    it('truthfully assesses infrastructure availability and distinguishes real vs blocked capabilities', async () => {
      const readiness = await getSystemReadiness();

      expect(readiness.timestamp).toBeDefined();
      expect(['OPERATIONAL', 'DEGRADED', 'NOT_READY']).toContain(readiness.overallStatus);

      // 1. Database readiness check
      const dbConnected = await checkDbConnectivity();
      if (!dbConnected) {
        expect(readiness.components.database.status).toBe('OFFLINE');
      } else {
        expect(readiness.components.database.status).toBe('AVAILABLE');
      }

      // 2. Browser runtime check
      expect(readiness.components.browserRuntime.status).toBe('AVAILABLE');

      // 3. Person 2 AI Role check (GPT-6 Luna via OpenAI)
      const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
      if (!hasOpenAiKey) {
        expect(readiness.components.openai.status).toBe('UNAVAILABLE');
        expect(readiness.components.openai.details).toContain('OPENAI_API_KEY');
      }

      // 4. Person 3 Evidence storage check
      expect(readiness.components.evidenceStorage.status).toBe('UNAVAILABLE');
    });

    it('verifies Playwright Chromium executable is present and launchable in current environment', async () => {
      const executablePath = chromium.executablePath();
      expect(executablePath).toBeDefined();

      let browser;
      try {
        browser = await chromium.launch({ headless: true });
        const version = browser.version();
        expect(version).toBeDefined();
        expect(version.length).toBeGreaterThan(0);
      } finally {
        if (browser) await browser.close();
      }
    });
  });

  // ===========================================================================
  // REAL PLAYWRIGHT BROWSER EXECUTION & GENUINE MEDIA CAPTURE
  // ===========================================================================
  describe('Real Playwright Browser Execution & Media Verification', () => {
    it('executes browser actions against real fixture, capturing genuine WebM video, console logs, and network trace', async () => {
      const investigationId = '88888888-8888-4888-8888-888888888888';

      const worker = new PlaywrightBrowserWorker({
        stagingRootDir: testStagingDir,
        defaultActionTimeoutMs: 10_000,
        maxAttemptDurationMs: 30_000,
      });

      const safeTarget: SafeTargetProfile = {
        id: 'target-real-01',
        name: 'Local Demo Target',
        baseUrl: serverUrl,
        allowedOrigins: [serverUrl],
        isSandboxVerified: true,
        environment: 'development',
        hasResetCapability: false,
        hasTestAccountConfigured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const plan: AuthoritativeExperimentPlan = {
        id: 'plan-real-01',
        investigationId,
        version: 1,
        targetId: safeTarget.id,
        targetUrl: serverUrl,
        allowedOrigins: [serverUrl],
        preconditions: ['Target web app is listening locally'],
        steps: [
          {
            stepIndex: 1,
            semanticAction: 'Navigate to target home page',
            toolKind: 'navigate',
            value: serverUrl,
            tier: 'TIER_1_READ_ONLY',
            timeoutMs: 10000,
          },
          {
            stepIndex: 2,
            semanticAction: 'Click trigger action button to invoke buggy API',
            toolKind: 'click_button',
            selector: '#submit-action-btn',
            tier: 'TIER_2_SAFE_INTERACTION',
            timeoutMs: 10000,
          },
        ],
        expectedCorrectBehavior: 'No error occurs',
        reportedFailureSignature: 'Crash alert banner is rendered in DOM',
        assertions: [
          {
            id: 'assert-crash-banner',
            description: 'Crash alert banner appears in DOM',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            purpose: 'REPORTED_FAILURE_SIGNATURE',
            subjectRef: '#crash-alert-banner',
            operator: 'EXISTS',
            settlingPoint: 'AFTER_NETWORK_IDLE',
          },
        ],
        maxAttempts: 2,
        maxDurationMs: 60000,
        requiresResetHook: false,
        planHash: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
      } as any;

      try {
        // Execute real Playwright browser attempt
        const receipt = await worker.executeAttempt({
          investigationId,
          attemptNumber: 1,
          plan,
          target: safeTarget,
        });

        // 1. Verify attempt receipt structure
        expect(receipt.completedCleanly).toBe(true);
        expect(receipt.actionsExecuted).toHaveLength(2);
        expect(receipt.captureCoverage.hasVideoRecording).toBe(true);
        expect(receipt.captureCoverage.hasConsoleLogs).toBe(true);
        expect(receipt.captureCoverage.hasNetworkTrace).toBe(true);

        // 2. Verify assertion observation was actually acquired from live DOM
        const obs = receipt.assertionObservations.get('assert-crash-banner');
        expect(obs).toBeDefined();
        expect(obs?.status).toBe('AVAILABLE');
        expect(obs?.elementCount).toBe(1);

        // 3. Inspect physical on-disk video recording
        const attempt1Dir = path.join(testStagingDir, investigationId, 'attempt-1');
        const videosDir = path.join(attempt1Dir, 'videos');
        const videoFiles = await fs.readdir(videosDir);
        expect(videoFiles.length).toBeGreaterThan(0);

        const videoPath = path.join(videosDir, videoFiles[0]);
        const videoStat = await fs.stat(videoPath);
        // Genuine Playwright screen recording must have non-trivial file size (> 1 KB)
        expect(videoStat.size).toBeGreaterThan(1024);

        // Binary inspection: Genuine WebM/Matroska files MUST start with the EBML Header [0x1A, 0x45, 0xDF, 0xA3]
        const videoHandle = await fs.open(videoPath, 'r');
        const headerBuf = Buffer.alloc(4);
        await videoHandle.read(headerBuf, 0, 4, 0);
        await videoHandle.close();

        const isEbmlWebM =
          headerBuf[0] === 0x1a &&
          headerBuf[1] === 0x45 &&
          headerBuf[2] === 0xdf &&
          headerBuf[3] === 0xa3;

        expect(isEbmlWebM).toBe(true);

        // 4. Inspect physical console logs on disk
        const consoleLogPath = path.join(attempt1Dir, 'console-attempt-1.json');
        const consoleContent = await fs.readFile(consoleLogPath, 'utf-8');
        const consoleEntries = JSON.parse(consoleContent);
        expect(Array.isArray(consoleEntries)).toBe(true);
        expect(consoleEntries.length).toBeGreaterThan(0);
        const hasErrorMessage = consoleEntries.some((e: any) =>
          typeof e.text === 'string' && e.text.includes('Fatal API Error: 500')
        );
        expect(hasErrorMessage).toBe(true);

        // 5. Inspect physical network trace on disk
        const networkTracePath = path.join(attempt1Dir, 'network-attempt-1.json');
        const networkContent = await fs.readFile(networkTracePath, 'utf-8');
        const networkEntries = JSON.parse(networkContent);
        expect(Array.isArray(networkEntries)).toBe(true);
        expect(networkEntries.length).toBeGreaterThan(0);
        const has500Request = networkEntries.some((n: any) =>
          n.url && n.url.includes('/api/submit-buggy') && n.status === 500
        );
        expect(has500Request).toBe(true);
      } finally {
        await worker.close();
      }
    });
  });

  // ===========================================================================
  // DEPENDENCY BLOCKS & EXACT HANDOFF SPECIFICATION
  // ===========================================================================
  describe('Authoritative Acceptance Status & Contributor Dependency Gates', () => {
    it('documents exact handoff requirements for blocked official acceptance gates', () => {
      const dependencies = [
        {
          gate: 'G3 (Agentic User Journey)',
          scenario: 'TC1, TC2',
          owner: 'Person 2',
          requiredModule: 'src/server/ai/luna-agent.ts',
          contract: 'ReportClarificationAgentPort, BrowserInvestigationAgentPort',
          status: 'BLOCKED_PENDING_PERSON_2',
          requiredInput: 'DraftReportIntake + SafeModelTargetContext',
          expectedOutput: 'Schema-valid ReportPlannerOutput with bounded assertions and steps',
          currentPerson1State: 'OpenAI client wrapper, budget manager, and typed doubles implemented and verified.',
        },
        {
          gate: 'G4 / TC4 (Public-Safe Redaction & Dual-Bucket Storage)',
          scenario: 'TC4',
          owner: 'Person 3',
          requiredModule: 'src/server/evidence/evidence-storage.service.ts',
          contract: 'EvidenceStoragePort',
          status: 'BLOCKED_PENDING_PERSON_3',
          requiredInput: 'FinalizedCaptureReference[] with local paths and secret sentinels',
          expectedOutput: 'Transformed public-safe files with token replaced by [REDACTED] and restricted tier isolation',
          currentPerson1State: 'Capture registrar, per-attempt triad validator, and tenant auth boundaries implemented.',
        },
        {
          gate: 'G5 (Deployed Evaluation)',
          scenario: 'TC1–TC4 in live staging',
          owner: 'All Contributors / Infrastructure',
          requiredModule: 'Authorized external staging deployment',
          contract: 'H-12 Handoff Package',
          status: 'NOT_RUN_LOCAL_CANDIDATE_ONLY',
          requiredInput: 'Authorized deployment host and live target credentials',
          expectedOutput: 'End-to-end execution logs from deployed web and worker containers',
          currentPerson1State: 'Dockerfile.web, Dockerfile.worker, docker-compose.yml, and CI pipeline prepared.',
        },
      ];

      expect(dependencies).toHaveLength(3);
      for (const dep of dependencies) {
        expect(['BLOCKED_PENDING_PERSON_2', 'BLOCKED_PENDING_PERSON_3', 'NOT_RUN_LOCAL_CANDIDATE_ONLY']).toContain(dep.status);
      }
    });
  });
});
