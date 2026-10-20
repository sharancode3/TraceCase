import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { WorkerHeartbeatService } from '@/server/queue/worker-heartbeat.service';
import { OutboxRelayService } from '@/server/queue/outbox-relay.service';
import { DeterministicAssertionEvaluator } from '@/server/verification/evaluator';
import { InvestigationClaimHandler } from '@/server/queue/investigation-claim-handler';
import { ExecutionLeaseService } from '@/server/queue/execution-lease.service';
import { TwoAttemptController } from '@/server/verification/two-attempt-controller';
import { GET as readyRoute } from '@/app/api/ready/route';
import {
  setServiceContainerForTesting,
  createDefaultServiceContainer,
} from '@/server/services/service-container';
import { unavailableBrowserWorker } from '@/server/services/ports';
import { _resetCachedEnvForTesting } from '@/server/config/env';
import { Phase6TestDbMock } from '../phase-6/test-db-mock';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';

describe('P1-08: Operational Hardening, Failure Recovery, and Truthful Readiness', () => {
  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    process.env.DEV_PREVIEW_MODE = 'false';
    _resetCachedEnvForTesting();
  });

  afterEach(() => {
    setServiceContainerForTesting(null);
    resetDbInstanceForTesting();
  });

  describe('1. Worker Heartbeat and Liveness Probing', () => {
    it('records active heartbeats and identifies active worker instances', async () => {
      const mockRows: any[] = [];
      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve(mockRows.filter((r) => r.status === 'ACTIVE')),
              then: (fn: any) => Promise.resolve(mockRows.filter((r) => r.status === 'ACTIVE')).then(fn),
            }),
          }),
        }),
        insert: () => ({
          values: (val: any) => {
            const row = { ...val, lastHeartbeatAt: new Date() };
            const existingIdx = mockRows.findIndex((r) => r.workerId === val.workerId);
            if (existingIdx >= 0) mockRows[existingIdx] = row;
            else mockRows.push(row);
            return {
              onConflictDoUpdate: () => Promise.resolve([row]),
            };
          },
        }),
        update: () => ({
          set: (val: any) => ({
            where: () => {
              mockRows.forEach((r) => Object.assign(r, val));
              return Promise.resolve();
            },
          }),
        }),
      };

      const heartbeatService = new WorkerHeartbeatService(() => mockDb);

      await heartbeatService.recordHeartbeat({
        workerId: 'worker-node-1',
        status: 'ACTIVE',
        activeJobs: 1,
        hostname: 'prod-worker-host',
        pid: 1234,
      });

      const liveness = await heartbeatService.isAnyWorkerActive(60_000);
      expect(liveness.active).toBe(true);
      expect(liveness.activeWorkerCount).toBe(1);

      await heartbeatService.recordShutdown('worker-node-1');
      expect(mockRows[0].status).toBe('OFFLINE');
    });
  });

  describe('2. Outbox Relay Abandoned In-Flight Message Recovery', () => {
    it('recovers abandoned PROCESSING messages back to PENDING after timeout', async () => {
      const abandonedMsg = {
        id: 'msg-abandoned-1',
        queueName: 'investigation_execution',
        payload: { investigationId: 'inv-1' },
        status: 'PROCESSING',
        attempts: 1,
        createdAt: new Date(Date.now() - 400_000), // > 300s old
        sentAt: null,
      };

      const mockDb: any = {
        update: () => ({
          set: (vals: any) => ({
            where: () => ({
              returning: () => {
                abandonedMsg.status = vals.status;
                return Promise.resolve([abandonedMsg]);
              },
            }),
          }),
        }),
      };

      const mockQueue: any = {
        send: vi.fn(),
      };

      const relay = new OutboxRelayService(mockQueue, () => mockDb);
      const recoveredCount = await relay.recoverAbandonedProcessingMessages(300_000);

      expect(recoveredCount).toBe(1);
      expect(abandonedMsg.status).toBe('PENDING');
    });
  });

  describe('3. Execution Claim Handler Duplicate Delivery & Pre-Flight Baseline Guard', () => {
    it('rejects duplicate execution deliveries when request is already terminal', async () => {
      const mockLeaseService: any = {
        acquireGlobalLease: vi.fn().mockResolvedValue({ acquired: true, epoch: 1 }),
        releaseGlobalLease: vi.fn().mockResolvedValue(true),
        assertFencingEpoch: vi.fn().mockResolvedValue(undefined),
      };

      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: 'exec-req-1',
                    investigationId: 'inv-1',
                    planVersion: 1,
                    planHash: 'hash-abc',
                    status: 'COMPLETED', // Terminal!
                  },
                ]),
            }),
          }),
        }),
      };

      const handler = new InvestigationClaimHandler(
        mockLeaseService as unknown as ExecutionLeaseService,
        unavailableBrowserWorker,
        () => mockDb
      );

      const result = await handler.handleInvestigationExecution(
        {
          executionRequestId: 'exec-req-1',
          investigationId: 'inv-1',
          planVersion: 1,
          planHash: 'hash-abc',
        },
        'worker-1'
      );

      expect(result.status).toBe('ALREADY_TERMINAL');
    });

    it('immediately halts execution when target pre-flight baseline verification fails', async () => {
      const testDb = new Phase6TestDbMock();
      setDbInstanceForTesting(testDb as any);

      const invId = '11111111-2222-4333-8444-555555555555';
      const execReqId = '22222222-3333-4444-8555-666666666666';
      const targetId = '33333333-4444-4555-8666-777777777777';
      const ownerId = 'usr-person-1';
      const planHash = 'f'.repeat(64);

      testDb.targets.push({
        id: targetId,
        ownerId,
        name: 'Protected Target',
        baseUrl: 'https://demo.app.local',
        allowedOrigins: ['https://demo.app.local'],
        isSandbox: true,
        isSandboxVerified: true,
        environment: 'demo',
        hasResetCapability: true,
        fixtureResetEndpoint: 'https://demo.app.local/api/test/reset-fixture',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      testDb.investigations.push({
        id: invId,
        ownerId,
        targetId,
        reportId: 'rep-01',
        lifecycleStatus: 'QUEUED',
        reviewStatus: 'APPROVED',
        workflowRevision: 1,
        eventSequenceCounter: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testDb.executionRequests.push({
        id: execReqId,
        investigationId: invId,
        planVersion: 1,
        planHash,
        approvalId: 'appr-01',
        status: 'ADMITTED',
        concurrencySlot: 'singleton',
        workerInstanceId: null,
        fencingEpoch: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      });

      testDb.planApprovals.push({
        id: 'appr-01',
        investigationId: invId,
        targetId,
        planVersion: 1,
        planHash,
        authorizedActorId: ownerId,
        maxActionTierPermitted: 'TIER_1_READ_ONLY',
        approvedBy: ownerId,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      testDb.experimentPlanRevisions.push({
        id: 'plan-1',
        investigationId: invId,
        version: 1,
        planHash,
        planPayload: {
          id: 'plan-1',
          investigationId: invId,
          version: 1,
          planHash,
          targetId,
          targetUrl: 'https://demo.app.local',
          allowedOrigins: ['https://demo.app.local'],
          preconditions: ['Baseline is valid'],
          steps: [],
          expectedCorrectBehavior: 'Ok',
          reportedFailureSignature: 'Error',
          assertions: [],
          maxAttempts: 2,
          maxDurationMs: 60000,
          requiresResetHook: true,
          initialBaseline: { expectedState: 'clean' },
        },
        createdBy: ownerId,
        createdAt: new Date(),
      });

      const mockLeaseService: any = {
        acquireGlobalLease: vi.fn().mockResolvedValue({ acquired: true, epoch: 1 }),
        renewGlobalLease: vi.fn().mockResolvedValue(true),
        releaseGlobalLease: vi.fn().mockResolvedValue(true),
        assertFencingEpoch: vi.fn().mockResolvedValue(undefined),
      };

      // Mock fetch to simulate failed pre-flight readback (dirty baseline readback)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ expectedState: 'dirty_discrepancy' }),
      } as any);

      try {
        const controller = new TwoAttemptController(
          mockLeaseService as unknown as ExecutionLeaseService,
          unavailableBrowserWorker as any,
          () => testDb as any
        );

        const outcome = await controller.executeInvestigationPair({
          executionRequestId: execReqId,
          investigationId: invId,
          workerInstanceId: 'worker-1',
          epoch: 1,
        });

        expect(outcome.status).toBe('PREFLIGHT_BASELINE_FAILED');
        expect(outcome.verdict).toBe('INCONCLUSIVE');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('4. Deterministic Evaluator ReDoS Protection and Length Bounding', () => {
    it('detects and rejects catastrophic backtracking regexes safely', () => {
      const dangerousRegex = '(a+)+$';
      const attackPayload = 'a'.repeat(25) + '!';

      const result = DeterministicAssertionEvaluator.evaluateAssertion(
        {
          id: 'asrt-redos',
          kind: 'VALUE_COMPARISON',
          source: 'DOM_ELEMENT',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          subjectRef: '#text',
          operator: 'MATCHES_REGEX',
          expectedValue: dangerousRegex,
          settlingPoint: 'AFTER_NETWORK_IDLE',
          description: 'ReDoS safety test',
        },
        {
          assertionId: 'asrt-redos',
          source: 'DOM_ELEMENT',
          status: 'AVAILABLE',
          observedValue: attackPayload,
          observedAt: new Date().toISOString(),
        }
      );

      // ReDoS regex is rejected safely without freezing event loop
      expect(result.result).toBe('INVALID_EVALUATION');
      expect(result.details).toContain('catastrophic backtracking');
    });

    it('rejects oversized evaluation payloads to prevent memory exhaustion', () => {
      const oversizedPayload = 'x'.repeat(6000); // Exceeds 5000 character limit

      const result = DeterministicAssertionEvaluator.evaluateAssertion(
        {
          id: 'asrt-large',
          kind: 'VALUE_COMPARISON',
          source: 'DOM_ELEMENT',
          purpose: 'REPORTED_FAILURE_SIGNATURE',
          subjectRef: '#text',
          operator: 'MATCHES_REGEX',
          expectedValue: 'valid-pattern',
          settlingPoint: 'AFTER_NETWORK_IDLE',
          description: 'Payload limit test',
        },
        {
          assertionId: 'asrt-large',
          source: 'DOM_ELEMENT',
          status: 'AVAILABLE',
          observedValue: oversizedPayload,
          observedAt: new Date().toISOString(),
        }
      );

      expect(result.result).toBe('INVALID_EVALUATION');
      expect(result.details).toContain('exceeds regex evaluation safety limit');
    });
  });

  describe('5. Truthful System Readiness Reporting', () => {
    it('returns HTTP 503 when worker daemon is inactive or queue is unavailable', async () => {
      setServiceContainerForTesting({
        ...createDefaultServiceContainer(),
        browserWorker: unavailableBrowserWorker,
      });

      const res = await readyRoute();

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.status).toBe('degraded');
      expect(json.overallStatus).toMatch(/DEGRADED|NOT_READY/);
      expect(json.components).toBeDefined();
    });
  });
});
