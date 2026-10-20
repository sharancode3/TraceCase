import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { AuthoritativeExperimentPlan, ExperimentPlan, PlanStep } from '@/contracts/planning';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { AttemptExecutionReceipt, ActionReceipt } from '@/contracts/observations';
import type { BrowserWorkerPort } from '@/server/services/ports';
import { TargetNetworkGuard } from './target-network-guard';
import { ObservationManager } from './observation-manager';
import { EvidenceCollector } from './evidence-collector';
import { VideoManager } from './video-manager';
import { ActionDispatcher } from './action-dispatcher';
import { ObservationCollector } from '@/server/verification/observation-collector';
import type { CapturedAssertionObservation } from '@/server/verification/types';

export interface ExtendedAttemptReceipt extends AttemptExecutionReceipt {
  assertionObservations: Map<string, CapturedAssertionObservation>;
}

export interface PlaywrightBrowserWorkerOptions {
  stagingRootDir?: string;
  defaultActionTimeoutMs?: number;
  maxAttemptDurationMs?: number;
  browserInstance?: Browser;
}

export class PlaywrightBrowserWorker implements BrowserWorkerPort {
  private stagingRootDir: string;
  private defaultActionTimeoutMs: number;
  private maxAttemptDurationMs: number;
  private sharedBrowser: Browser | null = null;
  private ownsBrowser: boolean = false;

  constructor(options: PlaywrightBrowserWorkerOptions = {}) {
    this.stagingRootDir = options.stagingRootDir || path.join(process.cwd(), '.tmp', 'staging');
    this.defaultActionTimeoutMs = options.defaultActionTimeoutMs || 15_000;
    this.maxAttemptDurationMs = options.maxAttemptDurationMs || 120_000;
    if (options.browserInstance) {
      this.sharedBrowser = options.browserInstance;
      this.ownsBrowser = false;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.sharedBrowser && this.sharedBrowser.isConnected()) {
      return this.sharedBrowser;
    }

    this.sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.ownsBrowser = true;
    return this.sharedBrowser;
  }

  async close(): Promise<void> {
    if (this.sharedBrowser && this.ownsBrowser) {
      await this.sharedBrowser.close().catch(() => {});
      this.sharedBrowser = null;
    }
  }

  /**
   * Executes a single scientific attempt in an isolated, fresh browser context.
   * Returns factual action receipts and coverage evidence without reproduction verdicts.
   */
  async executeAttempt(params: {
    investigationId: string;
    attemptNumber: 1 | 2;
    plan: AuthoritativeExperimentPlan | ExperimentPlan;
    target: SafeTargetProfile;
    onHeartbeat?: () => Promise<void>;
  }): Promise<ExtendedAttemptReceipt> {
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    const stagingDir = path.join(
      this.stagingRootDir,
      params.investigationId,
      `attempt-${params.attemptNumber}`
    );
    await fs.mkdir(stagingDir, { recursive: true });

    const networkGuard = new TargetNetworkGuard(params.target);
    const observationManager = new ObservationManager(params.attemptNumber);
    const evidenceCollector = new EvidenceCollector(
      params.investigationId,
      params.attemptNumber,
      stagingDir
    );
    const videoManager = new VideoManager(
      params.investigationId,
      params.attemptNumber,
      stagingDir
    );
    await videoManager.initialize();

    const actionDispatcher = new ActionDispatcher(networkGuard, observationManager, {
      stagingDir,
      defaultTimeoutMs: this.defaultActionTimeoutMs,
    });

    const browser = await this.getBrowser();
    let context: BrowserContext | null = null;
    let mainPage: Page | null = null;
    let contextCrashed = false;
    let assertionObservations = new Map<string, CapturedAssertionObservation>();

    const actionReceipts: ActionReceipt[] = [];

    try {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
          dir: videoManager.getVideoDir(),
          size: { width: 1280, height: 720 },
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 TraceCase/1.0',
        ignoreHTTPSErrors: Boolean(
          params.target.baseUrl.includes('localhost') ||
          params.target.baseUrl.includes('127.0.0.1')
        ),
      });

      // Strict network route guard intercepting any unauthorized egress
      await networkGuard.setupRouteInterception(context);

      mainPage = await context.newPage();
      evidenceCollector.attachPageListeners(mainPage, 'page-main');
      videoManager.trackPage(mainPage, 'page-main');

      // Listen for auxiliary pages / popups
      context.on('page', (popup) => {
        const popupId = `page-popup-${Date.now()}`;
        evidenceCollector.attachPageListeners(popup, popupId);
        videoManager.trackPage(popup, popupId);
      });

      const steps: PlanStep[] = params.plan.steps || [];

      for (const step of steps) {
        // Enforce attempt-level maximum duration budget
        const elapsedMs = Date.now() - startedAtMs;
        if (elapsedMs >= this.maxAttemptDurationMs) {
          actionReceipts.push({
            stepIndex: step.stepIndex,
            action: step,
            tier: step.tier,
            status: 'TIMED_OUT',
            durationMs: 0,
            uncertainty: 'NONE',
            errorDetails: `Global attempt duration budget (${this.maxAttemptDurationMs}ms) exceeded.`,
            dispatchedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          });
          break;
        }

        // Pre-action authorization & heartbeat check: fail closed before any action or mutation
        if (params.onHeartbeat) {
          try {
            await params.onHeartbeat();
          } catch (err: unknown) {
            throw new Error(`Pre-action authorization / lease check failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        const activePage = context.pages().slice(-1)[0] || mainPage;
        const receipt = await actionDispatcher.executeStep(activePage, step, {
          screenshotDir: stagingDir,
        });

        actionReceipts.push(receipt);

        // Post-action heartbeat renewal
        if (params.onHeartbeat) {
          try {
            await params.onHeartbeat();
          } catch (err: unknown) {
            throw new Error(`Post-action lease renewal failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // If mutating action timed out or crashed midway, halt immediately to protect state
        if (receipt.uncertainty === 'MUTATION_UNCERTAIN') {
          break;
        }

        // If step failed or timed out, do not blindly continue remaining dependent steps
        if (receipt.status !== 'SUCCESS') {
          break;
        }
      }

      // Collect frozen assertion observations while page is still ALIVE before context closure
      if (context && !contextCrashed) {
        const activePage = context.pages().slice(-1)[0] || mainPage;
        const planAssertions = (params.plan as AuthoritativeExperimentPlan).assertions;
        if (activePage && !activePage.isClosed() && Array.isArray(planAssertions)) {
          assertionObservations = await ObservationCollector.collectObservations({
            page: activePage,
            assertions: planAssertions,
            evidenceCollector,
          });
        }
      }
    } catch (err: unknown) {
      contextCrashed = true;
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (actionReceipts.length === 0 && params.plan.steps.length > 0) {
        const firstStep = params.plan.steps[0];
        actionReceipts.push({
          stepIndex: firstStep.stepIndex,
          action: firstStep,
          tier: firstStep.tier,
          status: 'FAILED',
          durationMs: 0,
          uncertainty: 'NONE',
          errorDetails: `Context initialization failure: ${errorMsg}`.slice(0, 500),
          dispatchedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
      }
    } finally {
      // Gracefully close pages and context to flush video streams
      if (mainPage) {
        await mainPage.close().catch(() => {});
      }
      if (context) {
        await context.close().catch(() => {
          contextCrashed = true;
        });
      }
    }

    // Finalize video files and verify on-disk integrity
    const videoResult = await videoManager.finalizeVideos(contextCrashed);

    // Finalize console and network traces
    const collectorResult = await evidenceCollector.finalizeEvidence();

    const coverage = videoManager.buildCoverageReceipt({
      videoStatus: videoResult.videoStatus,
      hasConsoleLogs: collectorResult.hasConsoleLogs,
      consoleStatus: collectorResult.consoleStatus,
      hasNetworkTrace: collectorResult.hasNetworkTrace,
      networkStatus: collectorResult.networkStatus,
    });

    const finishedAt = new Date().toISOString();
    const totalDurationMs = Math.max(0, Date.now() - startedAtMs);

    const stepsCount = params.plan.steps.length;
    const completedCleanly =
      stepsCount > 0 &&
      actionReceipts.length === stepsCount &&
      actionReceipts.every((r) => r.status === 'SUCCESS');

    return {
      investigationId: params.investigationId,
      attemptNumber: params.attemptNumber,
      actionsExecuted: actionReceipts,
      captureCoverage: coverage,
      totalDurationMs,
      completedCleanly,
      startedAt,
      finishedAt,
      assertionObservations,
    };
  }
}
