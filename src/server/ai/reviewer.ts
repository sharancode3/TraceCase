import type { EvidenceReviewAgentInput, EvidenceReviewOutput } from './contracts';
import { EvidenceReviewOutputSchema, stripModelAuthorityFields } from './contracts';
import type { ModelProviderPort, AiUsageReport } from './provider';
import { ModelProviderError } from './provider';
import {
  REVIEWER_SYSTEM_PROMPT,
  assembleReviewerUserPrompt,
  REVIEWER_PROMPT_VERSION,
} from './prompts/reviewer-prompt';

/**
 * ============================================================================
 * TRACECASE PERSON 2: EVIDENCE REVIEW AGENT (AT-ROLE-003)
 * ============================================================================
 * 
 * Synthesizes evidence-grounded reports comparing reproduction attempts.
 * Enforces strict invariants:
 * - Authoritative locked verdict cannot be altered
 * - Diagnostic hypotheses are never verified facts
 * - Evidence citations must belong to the verified safe artifact set
 * - Deterministic fallback provided upon model error or timeout
 */

export interface ReviewerExecutionResult {
  output: EvidenceReviewOutput;
  usage: AiUsageReport;
}

export { getEligibleArtifacts } from './prompts/reviewer-prompt';
import { getEligibleArtifacts } from './prompts/reviewer-prompt';

export class EvidenceReviewAgent {
  private provider: ModelProviderPort;

  constructor(provider: ModelProviderPort) {
    this.provider = provider;
  }

  /**
   * Main entrypoint: Synthesizes explanatory report from locked verification data
   */
  public async reviewEvidence(
    input: EvidenceReviewAgentInput,
    options?: { abortSignal?: AbortSignal }
  ): Promise<ReviewerExecutionResult> {
    const emptyUsage: AiUsageReport = {
      correlationId: input.investigationId,
      providerType: 'mock_test_double',
      modelIdentifier: this.provider.config.modelIdentifier,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      tokenCostUsd: '0.0000',
      durationMs: 0,
      retriesAttempted: 0,
      isLocalInference: true,
      usageSource: 'fallback_no_call',
      isFallback: true,
    };

    try {
      const userPrompt = assembleReviewerUserPrompt(input);

      const completion = await this.provider.generateStructuredCompletion<EvidenceReviewOutput>(
        {
          correlationId: input.investigationId,
          roleId: 'AT-ROLE-003',
          promptVersion: REVIEWER_PROMPT_VERSION,
          systemPrompt: REVIEWER_SYSTEM_PROMPT,
          userPrompt,
          temperature: 0.1,
          maxTokens: 2048,
          abortSignal: options?.abortSignal,
        },
        EvidenceReviewOutputSchema
      );

      // Sanitize authority fields
      const sanitizedOutput = stripModelAuthorityFields(
        completion.data as unknown as Record<string, unknown>
      ) as unknown as EvidenceReviewOutput;

      // Validate references and enforce invariants
      const validatedOutput = this.validateReviewerInvariants(sanitizedOutput, input);

      return {
        output: validatedOutput,
        usage: completion.usage,
      };
    } catch (err) {
      // Deterministic facts-only fallback on any model failure
      const fallbackReason = err instanceof Error ? err.message : 'Model review execution failed';
      const fallbackOutput = this.generateFactsOnlyFallback(input, fallbackReason);

      return {
        output: fallbackOutput,
        usage: err instanceof ModelProviderError && err.usage ? { ...err.usage, isFallback: true } : emptyUsage,
      };
    }
  }

  /**
   * Generates a 100% deterministic facts-only fallback when model inference is unavailable or fails.
   */
  public generateFactsOnlyFallback(
    input: EvidenceReviewAgentInput,
    fallbackReason: string
  ): EvidenceReviewOutput {
    return this.synthesizeFallback(input, fallbackReason);
  }

  /**
   * Constructs a deterministic, evidence-grounded fallback report
   * when AI model output fails validation or times out.
   */
  public synthesizeFallback(
    input: EvidenceReviewAgentInput,
    fallbackReason: string
  ): EvidenceReviewOutput {
    const attempt1Artifacts = getEligibleArtifacts(input.attempt1);
    const attempt2Artifacts = input.attempt2 ? getEligibleArtifacts(input.attempt2) : undefined;

    const availableArtifacts = [
      ...attempt1Artifacts.eligibleUrls,
      ...(attempt2Artifacts ? attempt2Artifacts.eligibleUrls : []),
    ];
    const missingOrRestricted = [
      ...attempt1Artifacts.restrictedList,
      ...(attempt2Artifacts ? attempt2Artifacts.restrictedList : []),
    ];

    const allAssertions = [
      ...input.attempt1.assertionsEvaluated,
      ...(input.attempt2 ? input.attempt2.assertionsEvaluated : []),
    ];

    const passedCount = allAssertions.filter((a) => a.passed).length;
    const failedCount = allAssertions.filter((a) => !a.passed).length;

    return {
      variant: 'EXPLANATION_UNAVAILABLE_FALLBACK',
      reproductionVerdict: input.reproductionVerdict,
      fallbackReason,
      deterministicFacts: {
        attempt1Status: input.attempt1.status,
        attempt1MatchedFailure: input.attempt1.failureSignatureMatched,
        attempt2MatchedFailure: input.attempt2 ? input.attempt2.failureSignatureMatched : null,
        evaluatedAssertionsCount: allAssertions.length,
        passedAssertionsCount: passedCount,
        failedAssertionsCount: failedCount,
        availableArtifacts,
        missingOrRestrictedEvidence: missingOrRestricted,
      },
    };
  }

  /**
   * Enforces semantic invariants and validates citations against the eligible safe set.
   */
  private validateReviewerInvariants(
    output: EvidenceReviewOutput,
    input: EvidenceReviewAgentInput
  ): EvidenceReviewOutput {
    if (output.variant === 'REPORT_SYNTHESIZED') {
      // Invariant 1: Locked verdict preservation
      output.observedReproductionVerdict = input.reproductionVerdict;

      // Invariant 2: Diagnostic hypothesis is never a verified fact
      if (output.diagnosticHypothesis) {
        output.diagnosticHypothesis.isVerifiedFact = false;
      }

      // Invariant 3: Citation reference validation (reject unknown or restricted URLs)
      const eligibleUrls = new Set<string>([
        ...getEligibleArtifacts(input.attempt1).eligibleUrls,
        ...(input.attempt2 ? getEligibleArtifacts(input.attempt2).eligibleUrls : []),
      ]);

      // Filter out any citations referencing unknown / restricted URLs
      output.evidenceCitations = output.evidenceCitations.filter((citation) =>
        eligibleUrls.has(citation.safeUrl)
      );

      // Invariant 4: Reset status qualification
      if (input.resetStatus && !input.resetStatus.success) {
        output.limitationsAndCaveats.push(
          `Baseline reset qualification warning: ${input.resetStatus.details || 'Fixture reset failed between attempts'}`
        );
      }

      // Invariant 5: Known gaps qualification
      if (input.knownGaps && input.knownGaps.length > 0) {
        for (const gap of input.knownGaps) {
          if (!output.limitationsAndCaveats.includes(gap)) {
            output.limitationsAndCaveats.push(`Evidence gap: ${gap}`);
          }
        }
      }
    }

    return output;
  }
}
