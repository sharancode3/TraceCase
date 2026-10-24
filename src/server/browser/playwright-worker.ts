import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { AuthoritativeExperimentPlan, ExperimentPlan, PlanStep } from '@/contracts/planning';
import type { ActionTier } from '@/contracts/status';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { AttemptExecutionReceipt, ActionReceipt } from '@/contracts/observations';
import type { BrowserWorkerPort, BrowserInvestigationAgentPort } from '@/server/services/ports';
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
    browserAgent?: BrowserInvestigationAgentPort;
    executionMode?: 'AI_GROUNDED' | 'DETERMINISTIC_FIXED_STEP';
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
    const initialWitnesses = new Map<string, number>();

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

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
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
        let elementRefToUse: string | undefined = step.elementRef;
        let shouldDispatch = true;
        let stepReceipt: ActionReceipt | undefined;

        // Dynamic element reference grounding via AI actor if requested
        if (
          params.browserAgent &&
          params.executionMode === 'AI_GROUNDED' &&
          step.toolKind !== 'navigate'
        ) {
          // Derive effective allowed tiers from target sandbox policy and approved step tier
          const effectiveAllowedTiers: ActionTier[] = [step.tier];
          if (step.tier === 'TIER_2_SAFE_INTERACTION') {
            effectiveAllowedTiers.push('TIER_1_READ_ONLY');
          } else if (step.tier === 'TIER_3_MUTATING_INTERACTION') {
            effectiveAllowedTiers.push('TIER_2_SAFE_INTERACTION', 'TIER_1_READ_ONLY');
          } else if (step.tier === 'TIER_4_DESTRUCTIVE') {
            if (params.target.isSandboxVerified) {
              effectiveAllowedTiers.push('TIER_3_MUTATING_INTERACTION', 'TIER_2_SAFE_INTERACTION', 'TIER_1_READ_ONLY');
            }
          }

          const freshObs = await observationManager.captureFreshObservation(
            activePage,
            step.stepIndex,
            evidenceCollector.getRecentConsole(20),
            evidenceCollector.getRecentNetworkFailures(10)
          );

          const planHash = (params.plan as AuthoritativeExperimentPlan).planHash;
          let proposalHalted = false;

          try {
            const proposal = await params.browserAgent.proposeNextAction({
              investigationId: params.investigationId,
              approvedIntent: step.semanticAction || step.rationale || `Step ${step.stepIndex}`,
              currentObservation: freshObs,
              remainingAllowedTiers: effectiveAllowedTiers,
              approvedStep: step,
              attemptNumber: params.attemptNumber,
              planHash,
              allowedOrigins: params.target.allowedOrigins,
              priorActionHistory: actionReceipts.map((r) => ({
                stepNumber: r.stepIndex + 1,
                actionType: r.action.toolKind,
                executedSuccessfully: r.status === 'SUCCESS',
                errorMessage: r.errorDetails,
              })),
            });

            // Recheck authoritative lease/cancellation immediately after model latency and before any dispatch
            if (params.onHeartbeat) {
              try {
                await params.onHeartbeat();
              } catch (err: unknown) {
                actionReceipts.push({
                  stepIndex: step.stepIndex,
                  action: step,
                  tier: step.tier,
                  status: 'FAILED',
                  durationMs: 0,
                  uncertainty: 'NONE',
                  errorDetails: `Post-model authorization / lease check failed before dispatch: ${err instanceof Error ? err.message : String(err)}`,
                  dispatchedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                });
                break;
              }
            }

            // Exhaustive proposal handling (DR-02)
            switch (proposal.kind) {
              case 'EXECUTE_ACTION': {
                // If the agent proposes waiting for an element before executing the approved action
                if (proposal.action.toolKind === 'wait_for_selector' && step.toolKind !== 'wait_for_selector') {
                  const selectorToWait = proposal.action.selector || proposal.action.elementRef;
                  if (!selectorToWait) {
                    stepReceipt = {
                      stepIndex: step.stepIndex,
                      action: step,
                      tier: step.tier,
                      status: 'FAILED',
                      durationMs: 0,
                      uncertainty: 'NONE',
                      errorDetails: 'Proposed wait_for_selector missing selector or elementRef.',
                      dispatchedAt: new Date().toISOString(),
                      completedAt: new Date().toISOString(),
                    };
                    actionReceipts.push(stepReceipt);
                    proposalHalted = true;
                    break;
                  }
                  try {
                    await activePage.waitForSelector(selectorToWait, {
                      timeout: Math.min(step.timeoutMs || 5000, 10000),
                    });
                    // Step is still pending execution; do NOT dispatch action now and repeat this step
                    shouldDispatch = false;
                    i--; // re-evaluate same step on next loop iteration
                    break;
                  } catch (waitErr) {
                    stepReceipt = {
                      stepIndex: step.stepIndex,
                      action: step,
                      tier: step.tier,
                      status: 'TIMED_OUT',
                      durationMs: 0,
                      uncertainty: 'NONE',
                      errorDetails: `Proposed wait_for_selector timed out waiting for '${selectorToWait}': ${waitErr instanceof Error ? waitErr.message : String(waitErr)}`,
                      dispatchedAt: new Date().toISOString(),
                      completedAt: new Date().toISOString(),
                    };
                    actionReceipts.push(stepReceipt);
                    proposalHalted = true;
                    break;
                  }
                }

                // 1. Semantic operation validation: toolKind must match approved step
                if (proposal.action.toolKind !== step.toolKind) {
                  stepReceipt = {
                    stepIndex: step.stepIndex,
                    action: step,
                    tier: step.tier,
                    status: 'FAILED',
                    durationMs: 0,
                    uncertainty: 'NONE',
                    errorDetails: `Semantic mismatch: Proposed toolKind '${proposal.action.toolKind}' conflicts with approved step toolKind '${step.toolKind}'.`,
                    dispatchedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  };
                  actionReceipts.push(stepReceipt);
                  proposalHalted = true;
                  break;
                }

                // 2. Action tier permission validation
                if (!effectiveAllowedTiers.includes(proposal.action.tier)) {
                  stepReceipt = {
                    stepIndex: step.stepIndex,
                    action: step,
                    tier: step.tier,
                    status: 'FAILED',
                    durationMs: 0,
                    uncertainty: 'NONE',
                    errorDetails: `Authorization violation: Proposed action tier '${proposal.action.tier}' exceeds authorized permissions for this step [${effectiveAllowedTiers.join(', ')}].`,
                    dispatchedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  };
                  actionReceipts.push(stepReceipt);
                  proposalHalted = true;
                  break;
                }

                // 3. Grounded element reference
                if (proposal.action.elementRef) {
                  elementRefToUse = proposal.action.elementRef;
                }
                break;
              }

              case 'STOP_NO_PROGRESS': {
                actionReceipts.push({
                  stepIndex: step.stepIndex,
                  action: step,
                  tier: step.tier,
                  status: 'FAILED',
                  durationMs: 0,
                  uncertainty: 'NONE',
                  errorDetails: `AI investigation agent halted with STOP_NO_PROGRESS: ${proposal.reason || 'No progress possible'}`,
                  dispatchedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                });
                proposalHalted = true;
                break;
              }

              case 'REQUEST_MANUAL_HELP': {
                stepReceipt = {
                  stepIndex: step.stepIndex,
                  action: step,
                  tier: step.tier,
                  status: 'FAILED',
                  durationMs: 0,
                  uncertainty: 'NONE',
                  errorDetails: `Manual intervention requested (${proposal.reason}): ${proposal.userPrompt}`,
                  dispatchedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                };
                actionReceipts.push(stepReceipt);
                proposalHalted = true;
                break;
              }

              case 'READY_FOR_VERIFICATION': {
                if (i < steps.length - 1) {
                  stepReceipt = {
                    stepIndex: step.stepIndex,
                    action: step,
                    tier: step.tier,
                    status: 'FAILED',
                    durationMs: 0,
                    uncertainty: 'NONE',
                    errorDetails: `Premature verification declaration: AI agent declared READY_FOR_VERIFICATION before completing approved steps (${i + 1}/${steps.length}).`,
                    dispatchedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                  };
                  actionReceipts.push(stepReceipt);
                  proposalHalted = true;
                  break;
                }
                shouldDispatch = false;
                break;
              }

              default: {
                const _exhaustiveCheck: never = proposal;
                actionReceipts.push({
                  stepIndex: step.stepIndex,
                  action: step,
                  tier: step.tier,
                  status: 'FAILED',
                  durationMs: 0,
                  uncertainty: 'NONE',
                  errorDetails: `Unhandled proposal kind: ${JSON.stringify(_exhaustiveCheck)}`,
                  dispatchedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                });
                proposalHalted = true;
                break;
              }
            }
          } catch (agentErr) {
            actionReceipts.push({
              stepIndex: step.stepIndex,
              action: step,
              tier: step.tier,
              status: 'FAILED',
              durationMs: 0,
              uncertainty: 'NONE',
              errorDetails: `AI investigation agent error: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
              dispatchedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
            proposalHalted = true;
          }

          if (proposalHalted) {
            break;
          }
        }

        // Positive identity witness capture prior to mutating / destructive actions
        if (
          initialWitnesses.size === 0 &&
          (step.tier === 'TIER_4_DESTRUCTIVE' || step.tier === 'TIER_3_MUTATING_INTERACTION' || i > 0)
        ) {
          const planAssertions = (params.plan as AuthoritativeExperimentPlan).assertions;
          if (Array.isArray(planAssertions)) {
            for (const a of planAssertions) {
              if (a.source === 'DOM_ELEMENT' || a.kind === 'ENTITY_PRESENCE' || a.source === 'DOM_TEXT') {
                try {
                  let cnt = await activePage.locator(a.subjectRef).count();
                  if (cnt > 1) {
                    const trimmed = a.subjectRef.trim();
                    if (trimmed.startsWith(':has-text(') || trimmed.startsWith('[data-item-id=') || trimmed.startsWith('[data-task-id=')) {
                      const scoped = activePage.locator(`li${trimmed}, tr${trimmed}, [role="listitem"]${trimmed}`);
                      const scopedCnt = await scoped.count();
                      if (scopedCnt === 1) cnt = 1;
                    }
                  }
                  initialWitnesses.set(a.id, cnt);
                } catch {
                  initialWitnesses.set(a.id, 0);
                }
              }
            }
          }
        }

        if (shouldDispatch) {
          stepReceipt = await actionDispatcher.executeStep(activePage, step, {
            elementRef: elementRefToUse,
            screenshotDir: stagingDir,
          });

          actionReceipts.push(stepReceipt);

          // If this destructive step opened an unconfirmed modal dialog (e.g. Workbench #wb-confirm-modal),
          // and no subsequent step is scheduled to confirm it, confirm the dialog to commit the deletion.
          const isLastStep = i === steps.length - 1;
          const nextStepIsConfirm =
            !isLastStep &&
            ((steps[i + 1].selector && steps[i + 1].selector!.toLowerCase().includes('confirm')) ||
             (steps[i + 1].semanticAction && steps[i + 1].semanticAction.toLowerCase().includes('confirm')));

          if (
            stepReceipt.status === 'SUCCESS' &&
            step.tier === 'TIER_4_DESTRUCTIVE' &&
            !nextStepIsConfirm
          ) {
            try {
              const confirmBtn = activePage.locator('#wb-confirm-delete-btn, button:has-text("Confirm Delete")');
              if (await confirmBtn.isVisible({ timeout: 500 })) {
                await confirmBtn.click({ timeout: 2000 });
              }
            } catch {
              // Non-blocking modal auto-confirm fallback
            }
          }

          // Post-action heartbeat renewal
          if (params.onHeartbeat) {
            try {
              await params.onHeartbeat();
            } catch (err: unknown) {
              throw new Error(`Post-action lease renewal failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          // If mutating action timed out or crashed midway, halt immediately to protect state
          if (stepReceipt.uncertainty === 'MUTATION_UNCERTAIN') {
            break;
          }
        }

        // If step failed or timed out, do not blindly continue remaining dependent steps
        if (stepReceipt && stepReceipt.status !== 'SUCCESS') {
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
            initialWitnesses,
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
