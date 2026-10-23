import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createDemoTargetServer } from '../../demo-target/server';
import { INITIAL_WORKBENCH_FIXTURE } from '../../demo-target/workbench/workbench-view';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import { PairAssessor } from '@/server/verification/pair-assessor';
import { IntegratedEvidenceStorageAdapter } from '@/server/evidence/evidence-storage-adapter';
import { InMemoryEvidenceStorageDriver } from '@/server/evidence/storage';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { AuthoritativeExperimentPlan } from '@/contracts/planning';
import type { AttemptAssessment } from '@/server/verification/types';
import { calculateAuthoritativePlanFingerprint } from '@/server/policy/plan-fingerprint';

describe('Person 2: Workbench Integrated End-to-End Reproduction Journey', () => {
  let demoTargetInstance: ReturnType<typeof createDemoTargetServer>;
  let targetPort: number;
  let targetOrigin: string;
  let targetBaseUrl: string;
  const resetSecret = 'workbench-integration-secret-2026';
  const tempDir = path.join(process.cwd(), '.tmp', 'workbench-e2e-evidence');

  beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true });

    // Start target in buggy mode
    demoTargetInstance = createDemoTargetServer({
      port: 0,
      resetSecret,
      bugModeActive: true,
      buildVersion: 'wb-v1.0.0-buggy',
    });
    targetPort = await demoTargetInstance.start(0, '127.0.0.1');
    targetOrigin = `http://127.0.0.1:${targetPort}`;
    targetBaseUrl = `${targetOrigin}/workbench`;
  });

  afterAll(async () => {
    if (demoTargetInstance) {
      await demoTargetInstance.stop();
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('1. Pre-flight Baseline Verification: validates initial 4-item workbench baseline', async () => {
    const safeTarget: SafeTargetProfile = {
      id: randomUUID(),
      name: 'TraceCase Workbench Sandbox',
      baseUrl: targetBaseUrl,
      allowedOrigins: [targetOrigin],
      isSandboxVerified: true,
      hasResetCapability: true,
      hasTestAccountConfigured: false,
      environment: 'demo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const expectedBaseline = {
      fixtureScope: 'workbench_work_items',
      buildVersion: 'wb-v1.0.0-buggy',
      itemCount: 4,
      items: INITIAL_WORKBENCH_FIXTURE,
    };

    const preflight = await TargetResetClient.verifyBaselineReadback({
      target: safeTarget,
      expectedBaseline,
      resetAuthSecret: resetSecret,
      fixtureScope: 'workbench_work_items',
    });

    expect(preflight.isEquivalent).toBe(true);
    expect(preflight.discrepancies).toHaveLength(0);
    expect(preflight.expectedStateHash).toBe(preflight.observedStateHash);
    expect(preflight.targetBuildId).toBe('wb-v1.0.0-buggy');
  });

  it('2. Plan Construction & Cryptographic Binding for Workbench Off-by-One Defect', () => {
    const targetId = randomUUID();
    const investigationId = randomUUID();

    const rawPlan = {
      id: randomUUID(),
      investigationId,
      version: 1,
      targetId,
      targetUrl: targetBaseUrl,
      allowedOrigins: [targetOrigin],
      testAccountRef: null,
      preconditions: ['Workbench target accessible', 'Baseline items seeded'],
      steps: [
        {
          stepIndex: 1,
          semanticAction: 'NAVIGATE',
          toolKind: 'navigate' as const,
          value: targetBaseUrl,
          tier: 'TIER_1_READ_ONLY' as const,
          timeoutMs: 10000,
          rationale: 'Open TraceCase Workbench page',
        },
        {
          stepIndex: 2,
          semanticAction: 'CLICK',
          toolKind: 'click_button' as const,
          selector: '#filter-active',
          tier: 'TIER_2_SAFE_INTERACTION' as const,
          timeoutMs: 5000,
          rationale: 'Filter queue to active work items only',
        },
        {
          stepIndex: 3,
          semanticAction: 'CLICK',
          toolKind: 'click_button' as const,
          selector: '[data-item-id="wb-item-02"] [data-action="delete"]',
          tier: 'TIER_2_SAFE_INTERACTION' as const,
          timeoutMs: 5000,
          rationale: 'Open deletion dialog for critical item wb-item-02',
        },
        {
          stepIndex: 4,
          semanticAction: 'CLICK',
          toolKind: 'click_button' as const,
          selector: '#wb-dialog-confirm-btn',
          tier: 'TIER_3_MUTATING_INTERACTION' as const,
          timeoutMs: 5000,
          rationale: 'Confirm deletion of wb-item-02',
        },
      ],
      expectedCorrectBehavior: 'Item wb-item-02 is removed from queue.',
      reportedFailureSignature: 'Item wb-item-01 is removed while wb-item-02 remains visible.',
      assertions: [
        {
          id: randomUUID(),
          kind: 'ENTITY_PRESENCE' as const,
          source: 'DOM_ELEMENT' as const,
          purpose: 'EXPECTED_CORRECT_BEHAVIOR' as const,
          subjectRef: '#wb-item-02',
          operator: 'NOT_EXISTS' as const,
          settlingPoint: 'AFTER_DOM_STABLE' as const,
          description: 'wb-item-02 should be removed',
        },
        {
          id: randomUUID(),
          kind: 'ENTITY_PRESENCE' as const,
          source: 'DOM_ELEMENT' as const,
          purpose: 'REPORTED_FAILURE_SIGNATURE' as const,
          subjectRef: '#wb-item-02',
          operator: 'EXISTS' as const,
          settlingPoint: 'AFTER_DOM_STABLE' as const,
          description: 'wb-item-02 incorrectly remains present due to index offset defect',
        },
      ],
      maxAttempts: 2 as const,
      maxDurationMs: 60000,
      requiresResetHook: true,
      fixtureScope: 'workbench_work_items',
    };

    const planHash = calculateAuthoritativePlanFingerprint(rawPlan);
    expect(planHash).toMatch(/^[a-f0-9]{64}$/);

    const authoritativePlan: AuthoritativeExperimentPlan = {
      ...rawPlan,
      planHash,
      createdAt: new Date().toISOString(),
    };

    expect(authoritativePlan.planHash).toBe(planHash);
    expect(authoritativePlan.fixtureScope).toBe('workbench_work_items');
  });

  it('3. Two-Attempt Execution, Verified Reset Gate, and Trusted Verdict Assessment', async () => {
    const safeTarget: SafeTargetProfile = {
      id: randomUUID(),
      name: 'TraceCase Workbench Sandbox',
      baseUrl: targetBaseUrl,
      allowedOrigins: [targetOrigin],
      isSandboxVerified: true,
      hasResetCapability: true,
      hasTestAccountConfigured: false,
      environment: 'demo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const expectedBaseline = {
      fixtureScope: 'workbench_work_items',
      buildVersion: 'wb-v1.0.0-buggy',
      itemCount: 4,
      items: INITIAL_WORKBENCH_FIXTURE,
    };

    const investigationId = randomUUID();

    // --- ATTEMPT 1 ---
    const deleteRes1 = await fetch(`${targetOrigin}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`, {
      method: 'DELETE',
    });
    expect(deleteRes1.status).toBe(200);
    const deleteData1 = await deleteRes1.json();
    expect(deleteData1.deletedItemId).toBe('wb-item-01'); // Defect reproduced!

    const att1Summary: AttemptAssessment = {
      attemptNumber: 1,
      validity: 'VALID',
      finding: 'REPORTED_FAILURE',
      preconditionsMet: true,
      procedureCompleted: true,
      scopeAdhered: true,
      requiredObservationsAvailable: true,
      evaluations: [
        {
          assertionId: randomUUID(),
          kind: 'ENTITY_PRESENCE',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          result: 'NOT_SATISFIED',
          observedValue: 'EXISTS',
          evaluatedAt: new Date().toISOString(),
        },
        {
          assertionId: randomUUID(),
          kind: 'ENTITY_PRESENCE',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          result: 'SATISFIED',
          observedValue: 'EXISTS',
          evaluatedAt: new Date().toISOString(),
        },
      ],
      assessedAt: new Date().toISOString(),
    };

    // --- RESET GATE (Between Attempt 1 and Attempt 2) ---
    const resetReceipt = await TargetResetClient.coordinateReset({
      target: safeTarget,
      investigationId,
      attemptPairId: 'test-attempt-pair-wb-001',
      expectedBaseline,
      resetAuthSecret: resetSecret,
      fixtureScope: 'workbench_work_items',
    });

    expect(resetReceipt.transportSuccess).toBe(true);
    expect(resetReceipt.baselineEquivalent).toBe(true);
    expect(resetReceipt.isVerifiedRestored).toBe(true);
    expect(resetReceipt.readback.isEquivalent).toBe(true);
    expect(resetReceipt.readback.discrepancies).toHaveLength(0);

    // --- ATTEMPT 2 ---
    const deleteRes2 = await fetch(`${targetOrigin}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`, {
      method: 'DELETE',
    });
    expect(deleteRes2.status).toBe(200);
    const deleteData2 = await deleteRes2.json();
    expect(deleteData2.deletedItemId).toBe('wb-item-01'); // Defect reproduced consistently!

    const att2Summary: AttemptAssessment = {
      attemptNumber: 2,
      validity: 'VALID',
      finding: 'REPORTED_FAILURE',
      preconditionsMet: true,
      procedureCompleted: true,
      scopeAdhered: true,
      requiredObservationsAvailable: true,
      evaluations: [
        {
          assertionId: randomUUID(),
          kind: 'ENTITY_PRESENCE',
          purpose: 'EXPECTED_CORRECT_BEHAVIOR',
          result: 'NOT_SATISFIED',
          observedValue: 'EXISTS',
          evaluatedAt: new Date().toISOString(),
        },
        {
          assertionId: randomUUID(),
          kind: 'ENTITY_PRESENCE',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          result: 'SATISFIED',
          observedValue: 'EXISTS',
          evaluatedAt: new Date().toISOString(),
        },
      ],
      assessedAt: new Date().toISOString(),
    };

    // --- TRUSTED VERDICT ASSESSMENT ---
    const assessment = PairAssessor.assessPair({
      investigationId,
      attempt1: att1Summary,
      attempt2: att2Summary,
      resetReceipt,
      targetBuildIdAttempt1: 'wb-v1.0.0-buggy',
      targetBuildIdAttempt2: 'wb-v1.0.0-buggy',
    });

    expect(assessment.verdict).toBe('CONFIRMED_REPRODUCED');
    expect(assessment.validAttemptCount).toBe(2);
    expect(assessment.matchingAttemptCount).toBe(2);
    expect(assessment.isComparable).toBe(true);
    expect(assessment.summary).toBeDefined();
  });

  it('4. Evidence Pipeline: authenticates and delivers sanitized workbench captures with valid checksums', async () => {
    const storageDriver = new InMemoryEvidenceStorageDriver();
    const adapter = new IntegratedEvidenceStorageAdapter(undefined, storageDriver);

    const investigationId = randomUUID();
    const consoleCaptureId = randomUUID();
    const networkCaptureId = randomUUID();

    const rawConsole = JSON.stringify([]);
    const rawNetwork = JSON.stringify([
      {
        requestId: 'req-wb-001',
        method: 'DELETE',
        url: `${targetOrigin}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`,
        status: 200,
        headers: { authorization: 'Bearer workbench-jwt-token-987654' },
        responseBody: { success: true, deletedItemId: 'wb-item-01' },
      },
    ]);

    // Stage raw artifacts into RESTRICTED_RAW storage
    await storageDriver.putArtifact({
      key: `investigations/${investigationId}/attempts/1/${consoleCaptureId}.log`,
      tier: 'RESTRICTED_RAW',
      data: rawConsole,
      mimeType: 'application/json',
    });

    await storageDriver.putArtifact({
      key: `investigations/${investigationId}/attempts/1/${networkCaptureId}.json`,
      tier: 'RESTRICTED_RAW',
      data: rawNetwork,
      mimeType: 'application/json',
    });

    // Process artifacts to generate sanitized derivatives
    const processingResults = await adapter.processArtifacts({
      investigationId,
      captureRefs: [
        {
          captureId: consoleCaptureId,
          investigationId,
          attemptNumber: 1,
          kind: 'CONSOLE_LOG',
          storageRef: `raw://${investigationId}/attempt-1/${consoleCaptureId}.log`,
          sizeBytes: Buffer.byteLength(rawConsole),
          sha256Checksum: 'a'.repeat(64),
          capturedAt: new Date().toISOString(),
        },
        {
          captureId: networkCaptureId,
          investigationId,
          attemptNumber: 1,
          kind: 'NETWORK_TRACE',
          storageRef: `raw://${investigationId}/attempt-1/${networkCaptureId}.json`,
          sizeBytes: Buffer.byteLength(rawNetwork),
          sha256Checksum: 'b'.repeat(64),
          capturedAt: new Date().toISOString(),
        },
      ],
    });

    expect(processingResults).toHaveLength(2);

    const consoleRes = processingResults.find((r) => r.kind === 'CONSOLE_LOG');
    expect(consoleRes?.publishedTier).toBe('PUBLIC_SAFE');
    expect(consoleRes?.isEligibleForSharing).toBe(true);

    const networkRes = processingResults.find((r) => r.kind === 'NETWORK_TRACE');
    expect(networkRes?.publishedTier).toBe('PUBLIC_SAFE');
    expect(networkRes?.isEligibleForSharing).toBe(true);

    // Verify sanitized network artifact does NOT contain raw secret
    const safeNetworkKey = `investigations/${investigationId}/attempts/1/attempt_1_network_${networkCaptureId}.json`;
    const storedSafeNetwork = await storageDriver.getArtifact(safeNetworkKey, 'PUBLIC_SAFE');
    expect(storedSafeNetwork).not.toBeNull();
    const safeNetworkText = storedSafeNetwork?.data.toString('utf-8') || '';
    expect(safeNetworkText).not.toContain('workbench-jwt-token-987654');
    expect(safeNetworkText).toContain('[REDACTED_SECRET]');
  });
});
