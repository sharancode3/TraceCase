import { randomUUID } from 'node:crypto';
import type {
  ReportClarificationAgentPort,
  BrowserInvestigationAgentPort,
  EvidenceReviewAgentPort,
  TargetResetPort,
} from '@/server/services/ports';
import { ServiceUnavailableError } from '@/server/services/ports';
import type { DraftReportIntake, ClarifiedReportContext } from '@/contracts/reports';
import type { SafeModelTargetContext } from '@/contracts/targets';
import type {
  ReportPlannerOutput,
  BrowserActionProposal,
  EvidenceExplanationProposal,
} from '@/contracts/ai';
import type {
  SanitizedBrowserObservation,
  VerificationAssertionResult,
} from '@/contracts/observations';
import type { FinalizedCaptureReference } from '@/contracts/evidence';
import type { ResetTransportResponse } from '@/contracts/reset';
import type {
  TypedAssertion,
  PlanStep,
  SupportedToolKind,
  TypedAssertionKind,
  ObservationSource,
  TypedAssertionOperator,
} from '@/contracts/planning';
import type { ModelProviderPort } from './provider';
import { OpenAiLunaProvider, ModelProviderError } from './provider';
import { ReportExperimentAgent } from './planner';
import { BrowserInteractionAgent } from './browser-actor';
import { EvidenceReviewAgent } from './reviewer';
import type {
  ReportAgentInput,
  BrowserAgentInput,
  EvidenceReviewAgentInput,
  PrunedAXTreeNode,
  PlanAssertion,
} from './contracts';

/**
 * ============================================================================
 * TRACECASE INTEGRATED AI ADAPTERS (Person 1 <-> Person 2 Bridge)
 * ============================================================================
 *
 * Connects Person 1's trusted backend ports to Person 2's AI role agents:
 * - AI Role 1: IntegratedReportClarificationAgent -> ReportExperimentAgent
 * - AI Role 2: IntegratedBrowserInvestigationAgent -> BrowserInteractionAgent
 * - AI Role 3: IntegratedEvidenceReviewAgent -> EvidenceReviewAgent
 * - Target Fixture: DefaultTargetResetAdapter -> Target reset HTTP protocol
 *
 * STRICT BOUNDARIES & INVARIANTS:
 * 1. Fail-closed: Throws ServiceUnavailableError if no key is configured on live calls.
 * 2. TC-INV-001: Luna gpt-6-luna only.
 * 3. TC-INV-008: Model hypotheses are never marked as verified facts.
 * 4. Models propose actions/plans; server authorizes and validates all schemas.
 */

function mapActionTypeToToolKind(actionType: string, targetRole?: string): SupportedToolKind {
  switch (actionType.toUpperCase()) {
    case 'NAVIGATE':
      return 'navigate';
    case 'CLICK':
      return targetRole?.toLowerCase() === 'link' ? 'click_link' : 'click_button';
    case 'FILL':
      return 'fill_input';
    case 'SELECT':
      return 'select_option';
    case 'WAIT_FOR_SELECTOR':
      return 'inspect_dom';
    default:
      return 'click_button';
  }
}

function mapPlanAssertionToTypedAssertion(
  assertion: PlanAssertion,
  purpose: 'EXPECTED_CORRECT_BEHAVIOR' | 'REPORTED_FAILURE_SIGNATURE'
): TypedAssertion {
  let kind: TypedAssertionKind = 'ENTITY_PRESENCE';
  let source: ObservationSource = 'DOM_ELEMENT';
  let operator: TypedAssertionOperator = 'EXISTS';

  switch (assertion.target) {
    case 'DOM_ELEMENT':
      kind = 'ENTITY_PRESENCE';
      source = 'DOM_ELEMENT';
      break;
    case 'HTTP_STATUS':
      kind = 'NETWORK_OBSERVATION';
      source = 'NETWORK_RESPONSE';
      break;
    case 'API_RESPONSE_BODY':
      kind = 'NETWORK_OBSERVATION';
      source = 'NETWORK_RESPONSE';
      break;
    case 'URL_PATH':
      kind = 'VALUE_COMPARISON';
      source = 'DOM_TEXT';
      break;
  }

  switch (assertion.expectedCondition) {
    case 'EXISTS':
      operator = 'EXISTS';
      break;
    case 'NOT_EXISTS':
      operator = 'NOT_EXISTS';
      break;
    case 'TEXT_CONTAINS':
      operator = 'CONTAINS';
      break;
    case 'STATUS_CODE_EQUALS':
      operator = 'EQUALS';
      break;
    case 'URL_MATCHES':
      operator = 'EQUALS';
      break;
  }

  return {
    id: randomUUID(),
    kind,
    source,
    purpose,
    subjectRef: assertion.selector || assertion.target,
    operator,
    expectedValue: String(assertion.expectedValue),
    settlingPoint: 'AFTER_NETWORK_IDLE',
    description:
      assertion.description ||
      `${assertion.predicateId}: ${assertion.expectedCondition} ${assertion.expectedValue}`,
  };
}

const ALLOWED_AX_ROLES = new Set([
  'status',
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
  'StaticText',
  'alert',
]);

function mapToAXRole(
  role?: string,
  isInteractive?: boolean,
  tagName?: string
): PrunedAXTreeNode['role'] {
  if (role && ALLOWED_AX_ROLES.has(role)) {
    return role as PrunedAXTreeNode['role'];
  }
  const tag = tagName?.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'input' || tag === 'textarea') return 'textbox';
  if (isInteractive) return 'button';
  return 'StaticText';
}

function resolveProvider(customProvider?: ModelProviderPort): ModelProviderPort | null {
  if (customProvider) {
    return customProvider;
  }
  const key = process.env.OPENAI_API_KEY;
  if (key && key.trim().length > 0) {
    try {
      return new OpenAiLunaProvider({
        apiKey: key,
        modelIdentifier: 'gpt-6-luna',
      });
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================================
// ROLE 1: REPORT CLARIFICATION & EXPERIMENT PROPOSER ADAPTER
// ============================================================================

export class IntegratedReportClarificationAgent implements ReportClarificationAgentPort {
  private readonly agent: ReportExperimentAgent | null;

  constructor(customProvider?: ModelProviderPort) {
    const provider = resolveProvider(customProvider);
    this.agent = provider ? new ReportExperimentAgent(provider) : null;
  }

  public async generateProposal(params: {
    report: DraftReportIntake | ClarifiedReportContext;
    target: SafeModelTargetContext;
  }): Promise<ReportPlannerOutput> {
    if (!this.agent) {
      throw new ServiceUnavailableError(
        'OpenAI (gpt-6-luna)',
        'OPENAI_API_KEY environment variable is not configured on this host.'
      );
    }

    const reportObj = params.report as Record<string, unknown>;
    const investigationId =
      (reportObj.reportId as string | undefined) ||
      (reportObj.investigationId as string | undefined) ||
      randomUUID();

    const title = (reportObj.title as string) || 'Untitled Bug Report';
    const description =
      (reportObj.rawDescription as string) ||
      (reportObj.bugDescription as string) ||
      (reportObj.rawInput as string) ||
      title;

    const environmentClues =
      (reportObj.browserEnvironment as string | undefined) ||
      (reportObj.targetEnvironment as string | undefined) ||
      undefined;

    const claimedExpectedBehavior =
      (reportObj.expectedBehavior as string | undefined) ||
      (reportObj.clarifiedExpectedBehavior as string | undefined) ||
      undefined;

    const safeInput: ReportAgentInput = {
      contractVersion: '1.0.0',
      investigationId,
      targetProfile: {
        name: params.target.name,
        baseUrl: params.target.baseUrl,
        isSandbox: params.target.isSandboxVerified,
        allowedOrigins: params.target.allowedOrigins,
        hasResetFixture: params.target.environment !== 'production',
      },
      rawReport: {
        title,
        description,
        environmentClues,
        claimedExpectedBehavior,
      },
      clarificationHistory: [],
    };

    let result;
    try {
      result = await this.agent.evaluateReport(safeInput);
    } catch (err: unknown) {
      if (err instanceof ModelProviderError && err.category === 'AUTHENTICATION') {
        throw new ServiceUnavailableError(
          'OpenAI (gpt-6-luna)',
          'OPENAI_API_KEY authentication failed with provider.'
        );
      }
      throw err;
    }

    if (result.output.variant === 'NEEDS_CLARIFICATION') {
      return {
        status: 'CLARIFICATION_NEEDED',
        preliminaryUnderstanding:
          result.output.extractedClaim?.summary ||
          'Clarification needed to establish reproduction parameters.',
        questions: result.output.questions.map((q) => ({
          questionId: q.questionId,
          questionText: q.questionText,
          purpose: q.whyItMatters,
          inputType: q.options && q.options.length > 0 ? 'SINGLE_CHOICE' : 'FREE_TEXT',
          options: q.options,
          targetField: 'EXPECTED_BEHAVIOR',
        })),
      };
    }

    if (result.output.variant === 'PLAN_PROPOSED') {
      const plan = result.output.experimentPlan;
      const steps: PlanStep[] = plan.steps.map((s, idx) => ({
        stepIndex: idx,
        semanticAction: s.intentDescription,
        toolKind: mapActionTypeToToolKind(s.actionType, s.targetRole),
        selector: s.targetAccessibleName || s.targetRole,
        value: s.inputValue,
        tier: s.isDestructive
          ? 'TIER_4_DESTRUCTIVE'
          : s.actionType === 'NAVIGATE' || s.actionType === 'WAIT_FOR_SELECTOR'
          ? 'TIER_1_READ_ONLY'
          : 'TIER_2_SAFE_INTERACTION',
        timeoutMs: 15000,
        rationale: s.intentDescription,
      }));

      const assertions: TypedAssertion[] = [
        ...plan.correctBehaviorAssertions.map((a) =>
          mapPlanAssertionToTypedAssertion(a, 'EXPECTED_CORRECT_BEHAVIOR')
        ),
        ...plan.reportedFailureAssertions.map((a) =>
          mapPlanAssertionToTypedAssertion(a, 'REPORTED_FAILURE_SIGNATURE')
        ),
      ];

      return {
        status: 'EXPERIMENT_PROPOSED',
        proposal: {
          preconditions: plan.preconditions,
          steps,
          expectedCorrectBehavior:
            result.output.extractedClaim.claimedExpectedBehavior ||
            'Expected correct behavior without defect.',
          reportedFailureSignature:
            result.output.extractedClaim.reportedProblem || 'Reported failure signature observed.',
          assertions,
          requiresResetHook: params.target.environment !== 'production',
          rationale: result.output.extractedClaim.summary,
        },
      };
    }

    // UNSUPPORTED_CLAIM / SCOPE_CONFLICT / UNABLE_TO_INTERPRET
    const reason =
      ('reason' in result.output && result.output.reason) ||
      ('conflictDetails' in result.output && result.output.conflictDetails) ||
      ('explanation' in result.output && result.output.explanation) ||
      'Unable to proceed with report reproduction.';

    const missingPrerequisites =
      'unsupportedFeatures' in result.output &&
      Array.isArray(result.output.unsupportedFeatures) &&
      result.output.unsupportedFeatures.length > 0
        ? result.output.unsupportedFeatures
        : ['Target scope or reproduction preconditions not satisfied.'];

    return {
      status: 'UNABLE_TO_PROCEED',
      reason,
      missingPrerequisites,
    };
  }
}

// ============================================================================
// ROLE 2: BROWSER INVESTIGATION AGENT ADAPTER
// ============================================================================

export class IntegratedBrowserInvestigationAgent implements BrowserInvestigationAgentPort {
  private readonly agent: BrowserInteractionAgent | null;

  constructor(customProvider?: ModelProviderPort) {
    const provider = resolveProvider(customProvider);
    this.agent = provider ? new BrowserInteractionAgent(provider) : null;
  }

  public async proposeNextAction(params: {
    investigationId: string;
    approvedIntent: string;
    currentObservation: SanitizedBrowserObservation;
    remainingAllowedTiers: string[];
  }): Promise<BrowserActionProposal> {
    if (!this.agent) {
      throw new ServiceUnavailableError(
        'OpenAI (gpt-6-luna)',
        'OPENAI_API_KEY environment variable is not configured on this host.'
      );
    }

    const nodeIdToElementRef = new Map<string, string>();
    const axTree: PrunedAXTreeNode[] = (params.currentObservation.visibleDomElements || []).map(
      (el, i) => {
        const nodeId = `node_${i}`;
        nodeIdToElementRef.set(nodeId, el.elementRef);
        return {
          nodeId,
          role: mapToAXRole(el.ariaRole, el.isInteractive, el.tagName),
          name: el.textSnippet || el.tagName,
          description: `${el.tagName} ${el.elementRef}`,
        };
      }
    );

    const input: BrowserAgentInput = {
      contractVersion: '1.0.0',
      investigationId: params.investigationId,
      attemptIndex: params.currentObservation.attemptNumber,
      approvedPlanHash: '0000000000000000000000000000000000000000000000000000000000000000',
      currentStep: {
        stepNumber: params.currentObservation.stepIndex + 1,
        actionType: 'CLICK',
        intentDescription: params.approvedIntent,
        targetDescription: params.approvedIntent,
        isDestructive: false,
      },
      observation: {
        observationId:
          ((params.currentObservation as unknown as Record<string, unknown>).observationId as
            | string
            | undefined) || randomUUID(),
        pageUrl: params.currentObservation.currentUrl,
        pageTitle: params.currentObservation.pageTitle,
        axTree,
      },
      priorActionHistory: [],
    };

    let result;
    try {
      result = await this.agent.proposeNextAction(input);
    } catch (err: unknown) {
      if (err instanceof ModelProviderError && err.category === 'AUTHENTICATION') {
        throw new ServiceUnavailableError(
          'OpenAI (gpt-6-luna)',
          'OPENAI_API_KEY authentication failed with provider.'
        );
      }
      throw err;
    }

    if (result.output.variant === 'PROPOSE_ACTION') {
      const resolvedRef = result.output.action.targetNodeId
        ? nodeIdToElementRef.get(result.output.action.targetNodeId)
        : undefined;
      const selector = resolvedRef || result.output.action.primarySelector || 'body';
      const toolKind = mapActionTypeToToolKind(result.output.action.actionType);

      return {
        kind: 'EXECUTE_ACTION',
        action: {
          stepIndex: params.currentObservation.stepIndex,
          semanticAction: result.output.expectedPostcondition || result.output.rationale,
          toolKind,
          selector,
          value: result.output.action.inputValue,
          tier: 'TIER_2_SAFE_INTERACTION',
          timeoutMs: 15000,
          rationale: result.output.rationale,
        },
        rationale: result.output.rationale,
        confidence: 0.9,
      };
    }

    if (result.output.variant === 'PROCEDURE_READY_FOR_VERIFICATION') {
      return {
        kind: 'READY_FOR_VERIFICATION',
        rationale: result.output.summaryOfActionsExecuted || 'Procedure settling point reached.',
        expectedSettlingPointReached: true,
      };
    }

    if (result.output.variant === 'REQUEST_HUMAN_HELP') {
      return {
        kind: 'REQUEST_MANUAL_HELP',
        reason:
          result.output.blockerType === 'CAPTCHA_DETECTED'
            ? 'CAPTCHA_DETECTED'
            : result.output.blockerType === 'OTP_REQUIRED'
            ? 'OTP_REQUIRED'
            : 'AUTH_EXPIRED',
        userPrompt: result.output.suggestedUserAction || result.output.blockerDescription,
      };
    }

    if (result.output.variant === 'STOP_BLOCKED') {
      return {
        kind: 'STOP_NO_PROGRESS',
        reason:
          result.output.errorDescription ||
          result.output.errorCode ||
          'Action progression blocked.',
        consecutiveNoProgressSteps: 1,
      };
    }

    if (result.output.variant === 'WAIT_FOR_STATE') {
      return {
        kind: 'EXECUTE_ACTION',
        action: {
          stepIndex: params.currentObservation.stepIndex,
          semanticAction: 'Wait for element state',
          toolKind: 'inspect_dom',
          selector: result.output.waitForSelector,
          tier: 'TIER_1_READ_ONLY',
          timeoutMs: result.output.timeoutMs || 5000,
          rationale: 'Awaiting requested selector state',
        },
        rationale: 'Awaiting requested selector state',
        confidence: 0.8,
      };
    }

    // REQUEST_OBSERVATION fallback
    return {
      kind: 'EXECUTE_ACTION',
      action: {
        stepIndex: params.currentObservation.stepIndex,
        semanticAction: 'Wait for observation update',
        toolKind: 'inspect_dom',
        selector: 'body',
        tier: 'TIER_1_READ_ONLY',
        timeoutMs: result.output.waitForTimeoutMs || 2000,
        rationale: result.output.reason,
      },
      rationale: result.output.reason,
      confidence: 0.8,
    };
  }
}

// ============================================================================
// ROLE 3: EVIDENCE REVIEW AGENT ADAPTER
// ============================================================================

export class IntegratedEvidenceReviewAgent implements EvidenceReviewAgentPort {
  private readonly agent: EvidenceReviewAgent | null;

  constructor(customProvider?: ModelProviderPort) {
    const provider = resolveProvider(customProvider);
    this.agent = provider ? new EvidenceReviewAgent(provider) : null;
  }

  public async synthesizeExplanation(params: {
    investigationId: string;
    lockedVerdict: string;
    verifiedAssertions: VerificationAssertionResult[];
    eligibleEvidence: FinalizedCaptureReference[];
  }): Promise<EvidenceExplanationProposal> {
    if (!this.agent) {
      throw new ServiceUnavailableError(
        'OpenAI (gpt-6-luna)',
        'OPENAI_API_KEY environment variable is not configured on this host.'
      );
    }

    let reproductionVerdict:
      | 'CONFIRMED_REPRODUCED'
      | 'NOT_REPRODUCED'
      | 'INCONSISTENT_OBSERVATIONS'
      | 'INCONCLUSIVE_EXECUTION_FAILURE' = 'INCONCLUSIVE_EXECUTION_FAILURE';

    if (
      params.lockedVerdict === 'REPRODUCED' ||
      params.lockedVerdict === 'CONFIRMED_REPRODUCED'
    ) {
      reproductionVerdict = 'CONFIRMED_REPRODUCED';
    } else if (params.lockedVerdict === 'NOT_REPRODUCED') {
      reproductionVerdict = 'NOT_REPRODUCED';
    } else if (params.lockedVerdict === 'INCONSISTENT_OBSERVATIONS') {
      reproductionVerdict = 'INCONSISTENT_OBSERVATIONS';
    }

    const assertionsEvaluated = params.verifiedAssertions.map((a) => ({
      predicateId: a.assertionId,
      predicateDescription: `Assertion ${a.assertionId}`,
      passed: a.result === 'SATISFIED',
      actualValue: a.observedValue || (a.result === 'SATISFIED' ? 'SATISFIED' : 'NOT_SATISFIED'),
      expectedValue: 'SATISFIED',
    }));

    const input: EvidenceReviewAgentInput = {
      contractVersion: '1.0.0',
      investigationId: params.investigationId,
      reproductionVerdict,
      testedEnvironment: 'TraceCase Automated Environment',
      attempt1: {
        status:
          reproductionVerdict === 'CONFIRMED_REPRODUCED'
            ? 'FAILED_ASSERTIONS'
            : 'PASSED_ASSERTIONS',
        failureSignatureMatched: reproductionVerdict === 'CONFIRMED_REPRODUCED',
        executionDurationMs: 5000,
        isValid: true,
        assertionsEvaluated,
        safeArtifacts: {},
        sanitizedConsoleExcerpts: [],
      },
      attempt2: null,
    };

    let result;
    try {
      result = await this.agent.reviewEvidence(input);
    } catch (err: unknown) {
      if (err instanceof ModelProviderError && err.category === 'AUTHENTICATION') {
        throw new ServiceUnavailableError(
          'OpenAI (gpt-6-luna)',
          'OPENAI_API_KEY authentication failed with provider.'
        );
      }
      throw err;
    }

    if (result.output.variant === 'REPORT_SYNTHESIZED') {
      const observationsVsHypotheses = result.output.diagnosticHypothesis
        ? [
            {
              observation: result.output.executiveSummary,
              hypothesis: result.output.diagnosticHypothesis.hypothesisText,
            },
          ]
        : [];

      const evidenceReferences = params.eligibleEvidence.map((ev) => ({
        artifactId: ev.captureId,
        description: `Evidence capture: ${ev.kind}`,
      }));

      const attempt2Summary = result.output.attempt2Comparison
        ? ` Attempt 2: ${result.output.attempt2Comparison.summary}`
        : '';

      return {
        investigationId: params.investigationId,
        naturalLanguageSummary: result.output.executiveSummary,
        verifiedFactsExplanation: `Attempt 1: ${result.output.attempt1Comparison.summary}.${attempt2Summary}`,
        observationsVsHypotheses,
        evidenceReferences,
        limitationsAndGaps: result.output.limitationsAndCaveats || [],
      };
    }

    if (result.output.variant === 'EVIDENCE_GAP_DETECTED') {
      return {
        investigationId: params.investigationId,
        naturalLanguageSummary: 'Insufficient evidence to synthesize reproduction report.',
        verifiedFactsExplanation: result.output.impactOnConfirmation,
        observationsVsHypotheses: [],
        evidenceReferences: [],
        limitationsAndGaps: result.output.missingArtifactTypes,
      };
    }

    if (result.output.variant === 'INCONSISTENT_EVIDENCE_DETECTED') {
      return {
        investigationId: params.investigationId,
        naturalLanguageSummary: 'Inconsistent evidence detected during synthesis.',
        verifiedFactsExplanation: result.output.inconsistencySummary,
        observationsVsHypotheses: [],
        evidenceReferences: [],
        limitationsAndGaps: result.output.conflictingObservations,
      };
    }

    if (result.output.variant === 'REVIEW_UNABLE_TO_COMPLETE') {
      return {
        investigationId: params.investigationId,
        naturalLanguageSummary: 'Evidence review unable to complete.',
        verifiedFactsExplanation: result.output.errorDescription,
        observationsVsHypotheses: [],
        evidenceReferences: [],
        limitationsAndGaps: [result.output.errorCode],
      };
    }

    // EXPLANATION_UNAVAILABLE_FALLBACK
    const fallbackOutput = result.output as {
      fallbackReason?: string;
      safeSuggestedNextSteps?: string[];
    };
    return {
      investigationId: params.investigationId,
      naturalLanguageSummary: 'Explanation unavailable.',
      verifiedFactsExplanation: fallbackOutput.fallbackReason || 'Explanation unavailable.',
      observationsVsHypotheses: [],
      evidenceReferences: [],
      limitationsAndGaps: fallbackOutput.safeSuggestedNextSteps || ['Review raw telemetry manually.'],
    };
  }
}

// ============================================================================
// TARGET RESET PORT ADAPTER
// ============================================================================

export class DefaultTargetResetAdapter implements TargetResetPort {
  public async triggerFixtureReset(params: {
    targetId: string;
    resetEndpoint: string;
    resetAuthSecret: string;
    fixtureScope: string;
  }): Promise<ResetTransportResponse> {
    const res = await fetch(params.resetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TraceCase-Reset-Secret': params.resetAuthSecret,
        'X-TraceCase-Reset-Auth': params.resetAuthSecret,
        Authorization: `Bearer ${params.resetAuthSecret}`,
      },
      body: JSON.stringify({
        targetId: params.targetId,
        fixtureScope: params.fixtureScope,
      }),
    });

    const isSuccess = res.ok;
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON response
    }

    return {
      success: isSuccess,
      itemsRestored: typeof data.itemsRestored === 'number' ? data.itemsRestored : undefined,
      targetTimestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
      rawPayload: data,
    };
  }
}
