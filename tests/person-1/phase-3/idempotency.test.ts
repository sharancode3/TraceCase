import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { idempotencyRepository } from '@/server/db/repositories/idempotency.repository';
import {
  executeWithIdempotency,
  calculateCommandFingerprint,
} from '@/server/workflow/workflow-http';
import { POST as approveRoute } from '@/app/api/v1/investigations/[id]/approve/route';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';
import { _resetCachedEnvForTesting } from '@/server/config/env';
import { Phase3TestDbMock } from './test-db-mock';

describe('P1-03: Durable Command Idempotency and Deduplication', () => {
  let mockDb: Phase3TestDbMock;

  const principalA = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'userA@tracecase.internal',
    role: 'operator' as const,
    externalIssuer: 'https://auth.tracecase.test',
    externalSubject: 'usr-sub-a',
  };

  const principalB = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'userB@tracecase.internal',
    role: 'operator' as const,
    externalIssuer: 'https://auth.tracecase.test',
    externalSubject: 'usr-sub-b',
  };

  beforeEach(() => {
    mockDb = new Phase3TestDbMock();
    setDbInstanceForTesting(mockDb as any);
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  describe('Low-Level Repository and Middleware Logic', () => {
    it('executes new command and completes idempotency record', async () => {
      let callCount = 0;
      const payload = { planVersion: 1, action: 'APPROVE' };

      const res = await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: 'idem-key-001',
        resourceId: 'res-001',
        commandName: 'APPROVE_PLAN',
        payload,
        handler: async () => {
          callCount++;
          return { status: 200, body: { success: true, count: callCount } };
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(callCount).toBe(1);

      // Verify DB record
      const record = mockDb.idempotencyKeys.find((k) => k.key === 'idem-key-001');
      expect(record).toBeDefined();
      expect(record.status).toBe('COMPLETED');
      expect(record.responseStatus).toBe(200);
    });

    it('replays cached response on duplicate request with identical payload without re-executing handler', async () => {
      let callCount = 0;
      const payload = { planVersion: 1, action: 'APPROVE' };

      // 1. Initial call
      const res1 = await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: 'idem-key-002',
        resourceId: 'res-002',
        commandName: 'APPROVE_PLAN',
        payload,
        handler: async () => {
          callCount++;
          return { status: 200, body: { runId: 'run-abc', callCount } };
        },
      });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.runId).toBe('run-abc');
      expect(callCount).toBe(1);

      // 2. Replay call
      const res2 = await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: 'idem-key-002',
        resourceId: 'res-002',
        commandName: 'APPROVE_PLAN',
        payload,
        handler: async () => {
          callCount++;
          return { status: 200, body: { runId: 'run-xyz', callCount } };
        },
      });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.runId).toBe('run-abc'); // returned cached result
      expect(callCount).toBe(1); // handler NOT executed second time
    });

    it('rejects key reuse with mismatched payload with 409 Conflict', async () => {
      const payload1 = { planVersion: 1, action: 'APPROVE' };
      const payload2 = { planVersion: 2, action: 'APPROVE' }; // Different payload!

      await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: 'idem-key-003',
        resourceId: 'res-003',
        commandName: 'APPROVE_PLAN',
        payload: payload1,
        handler: async () => ({ status: 200, body: { approved: true } }),
      });

      const conflictRes = await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: 'idem-key-003',
        resourceId: 'res-003',
        commandName: 'APPROVE_PLAN',
        payload: payload2,
        handler: async () => ({ status: 200, body: { approved: true } }),
      });

      expect(conflictRes.status).toBe(409);
      const conflictJson = await conflictRes.json();
      expect(conflictJson.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('isolates idempotency keys by principal ID (Tenant Isolation)', async () => {
      let callCountA = 0;
      let callCountB = 0;
      const sharedKeyName = 'duplicate-key-name';
      const payload = { action: 'DO_SOMETHING' };

      // Principal A
      const resA = await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: sharedKeyName,
        resourceId: 'res-a',
        commandName: 'DO_IT',
        payload,
        handler: async () => {
          callCountA++;
          return { status: 200, body: { owner: 'A' } };
        },
      });

      // Principal B using same key name
      const resB = await executeWithIdempotency({
        principalId: principalB.id,
        idempotencyKey: sharedKeyName,
        resourceId: 'res-b',
        commandName: 'DO_IT',
        payload,
        handler: async () => {
          callCountB++;
          return { status: 200, body: { owner: 'B' } };
        },
      });

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(callCountA).toBe(1);
      expect(callCountB).toBe(1);
    });

    it('releases key on error to allow subsequent retry', async () => {
      let attempts = 0;
      const payload = { test: true };

      // Attempt 1: throws error
      await expect(
        executeWithIdempotency({
          principalId: principalA.id,
          idempotencyKey: 'fail-retry-key',
          resourceId: 'res-fail',
          commandName: 'FAIL_COMMAND',
          payload,
          handler: async () => {
            attempts++;
            throw new Error('Transient network error');
          },
        })
      ).rejects.toThrow('Transient network error');

      expect(attempts).toBe(1);

      // Attempt 2: retry with same key succeeds
      const retryRes = await executeWithIdempotency({
        principalId: principalA.id,
        idempotencyKey: 'fail-retry-key',
        resourceId: 'res-fail',
        commandName: 'FAIL_COMMAND',
        payload,
        handler: async () => {
          attempts++;
          return { status: 200, body: { successAfterRetry: true } };
        },
      });

      expect(retryRes.status).toBe(200);
      const json = await retryRes.json();
      expect(json.successAfterRetry).toBe(true);
      expect(attempts).toBe(2);
    });
  });

  describe('Route-Level Idempotency HTTP Header Support', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
      process.env.DEV_PREVIEW_MODE = 'false';
      _resetCachedEnvForTesting();
      setCustomPrincipalResolverForTesting(async () => principalA);
    });

    afterEach(() => {
      setCustomPrincipalResolverForTesting(null);
    });

    it('replays approval response when X-Idempotency-Key header is supplied on POST /approve', async () => {
      const invId = '44444444-4444-4444-8444-444444444444';
      const targetId = '55555555-5555-4555-8555-555555555555';
      const planHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      // Seed DB
      mockDb.targets.push({
        id: targetId,
        ownerId: principalA.id,
        name: 'Target',
        baseUrl: 'https://demo.app.local',
        allowedOrigins: ['https://demo.app.local'],
        isSandbox: true,
        isSandboxVerified: true,
      });

      mockDb.investigations.push({
        id: invId,
        ownerId: principalA.id,
        targetId,
        reportId: 'rep-1',
        lifecycleStatus: 'INITIALIZED',
        reviewStatus: 'PROPOSAL_READY',
        workflowRevision: 2,
        planVersion: 1,
        planHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const planPayload = {
        id: 'plan-1',
        investigationId: invId,
        version: 1,
        targetId,
        targetUrl: 'https://demo.app.local',
        allowedOrigins: ['https://demo.app.local'],
        preconditions: ['Precondition 1'],
        steps: [
          {
            stepIndex: 0,
            semanticAction: 'Navigate',
            toolKind: 'navigate',
            value: 'https://demo.app.local',
            tier: 'TIER_1_READ_ONLY',
            timeoutMs: 15000,
          },
        ],
        expectedCorrectBehavior: 'Item loaded successfully',
        reportedFailureSignature: 'Error 500 thrown instead',
        assertions: [
          {
            id: '88888888-8888-4888-8888-888888888881',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            purpose: 'EXPECTED_CORRECT_BEHAVIOR',
            subjectRef: '.item',
            operator: 'EXISTS',
            settlingPoint: 'AFTER_NETWORK_IDLE',
            description: 'Item card exists',
          },
          {
            id: '88888888-8888-4888-8888-888888888882',
            kind: 'ENTITY_PRESENCE',
            source: 'DOM_ELEMENT',
            purpose: 'REPORTED_FAILURE_SIGNATURE',
            subjectRef: '.error',
            operator: 'EXISTS',
            settlingPoint: 'AFTER_NETWORK_IDLE',
            description: 'Error exists',
          },
        ],
        maxAttempts: 2,
        maxDurationMs: 120000,
        requiresResetHook: true,
      };

      const computedHash = calculateCommandFingerprint(planPayload); // Wait, plan fingerprint
      // Let's import calculateAuthoritativePlanFingerprint
      const { calculateAuthoritativePlanFingerprint } = await import('@/server/policy/plan-fingerprint');
      const canonicalPlanHash = calculateAuthoritativePlanFingerprint(planPayload);

      // Update investigation with canonical plan hash
      mockDb.investigations[0].planHash = canonicalPlanHash;

      mockDb.experimentPlanRevisions.push({
        id: 'plan-1',
        investigationId: invId,
        version: 1,
        planHash: canonicalPlanHash,
        planPayload: { ...planPayload, planHash: canonicalPlanHash },
        createdBy: principalA.id,
        createdAt: new Date(),
      });

      const body = {
        investigationId: invId,
        planVersion: 1,
        approvedPlanHash: canonicalPlanHash,
        operatorNotes: 'Approved with idempotency key',
      };

      const makeRequest = () =>
        new NextRequest(
          new Request(`http://localhost:3000/api/v1/investigations/${invId}/approve`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': 'client-req-uuid-999',
            },
            body: JSON.stringify(body),
          })
        );

      // Call 1
      const res1 = await approveRoute(makeRequest(), { params: Promise.resolve({ id: invId }) });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.status).toBe('APPROVED');

      // Call 2 with identical key and body
      const res2 = await approveRoute(makeRequest(), { params: Promise.resolve({ id: invId }) });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.status).toBe('APPROVED');
      expect(json2.data.id).toBe(json1.data.id);

      // Verify exactly ONE approval record exists in DB
      const approvals = mockDb.planApprovals.filter((a) => a.investigationId === invId);
      expect(approvals).toHaveLength(1);
    });
  });
});
