import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getTableName } from 'drizzle-orm';
import { POST as createReportRoute } from '@/app/api/v1/reports/route';
import { POST as createTargetRoute } from '@/app/api/v1/targets/route';
import { setCustomVerifierForTesting } from '@/server/auth/jwt';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { _resetCachedEnvForTesting } from '@/server/config/env';
import {
  executePlanningTransition,
  formatSafePlanningError,
} from '@/features/investigations/planning-orchestration';

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
}

function extractEqualityChecks(node: any): Array<{ column: string; expectedValue: any }> {
  if (!node) return [];
  const checks: Array<{ column: string; expectedValue: any }> = [];

  function walk(n: any) {
    if (!n) return;
    if (n.queryChunks && Array.isArray(n.queryChunks)) {
      const chunks = n.queryChunks;
      for (let i = 0; i < chunks.length; i++) {
        const cur = chunks[i];
        if (cur && cur.name && chunks[i + 1]?.value?.[0] === ' = ' && chunks[i + 2]?.value !== undefined) {
          checks.push({ column: cur.name, expectedValue: chunks[i + 2].value });
        } else if (cur && cur.queryChunks) {
          walk(cur);
        }
      }
    }
  }

  walk(node);
  return checks;
}

function matchesAll(row: any, checks: Array<{ column: string; expectedValue: any }>): boolean {
  for (const check of checks) {
    const colSnake = check.column;
    const colCamel = toCamel(check.column);
    const actual = row[colCamel] !== undefined ? row[colCamel] : row[colSnake];
    if (actual !== check.expectedValue) {
      return false;
    }
  }
  return true;
}

class PhaseEDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];
  public idempotencyKeys: any[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'idempotency_keys') return this.idempotencyKeys;
    return [];
  }

  select(selectFields?: any) {
    return {
      from: (table: any) => {
        const tableArray = this.getTableArray(table);

        const buildQueryResult = (filterFn?: (row: any) => boolean) => {
          const getRows = () => (filterFn ? tableArray.filter(filterFn) : [...tableArray]);
          return {
            limit: (n: number) => Promise.resolve(getRows().slice(0, n)),
            then: (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
          };
        };

        return {
          where: (condition: any) => {
            const checks = extractEqualityChecks(condition);
            return buildQueryResult((row) => matchesAll(row, checks));
          },
          limit: (n: number) => Promise.resolve(tableArray.slice(0, n)),
          then: (resolve: any, reject: any) => Promise.resolve([...tableArray]).then(resolve, reject),
        };
      },
    };
  }

  insert(table: any) {
    return {
      values: (val: any) => {
        const now = new Date();
        const row = {
          ...val,
          id: val.id || crypto.randomUUID(),
          createdAt: val.createdAt || now,
          updatedAt: val.updatedAt || now,
        };

        const tableName = getTableName(table);
        if (tableName === 'principals') this.principals.push(row);
        else if (tableName === 'targets') this.targets.push(row);
        else if (tableName === 'bug_reports') this.bugReports.push(row);
        else if (tableName === 'investigations') this.investigations.push(row);
        else if (tableName === 'idempotency_keys') this.idempotencyKeys.push(row);

        return {
          returning: () => Promise.resolve([row]),
          then: (resolve: any, reject: any) => Promise.resolve([row]).then(resolve, reject),
        };
      },
    };
  }

  update(table: any) {
    return {
      set: (updateValues: any) => {
        return {
          where: (condition: any) => {
            const checks = extractEqualityChecks(condition);
            const tableArray = this.getTableArray(table);
            const updatedRows: any[] = [];

            for (const row of tableArray) {
              if (matchesAll(row, checks)) {
                Object.assign(row, updateValues, { updatedAt: new Date() });
                updatedRows.push(row);
              }
            }

            return {
              returning: () => Promise.resolve(updatedRows),
              then: (resolve: any, reject: any) => Promise.resolve(updatedRows).then(resolve, reject),
            };
          },
        };
      },
    };
  }

  async transaction(cb: (tx: this) => Promise<any>) {
    return cb(this);
  }
}

describe('Phase E: Durable report save and safe planning retries', () => {
  let dbMock: PhaseEDbMock;
  const OPERATOR_TOKEN = 'mock-operator-token';
  const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    process.env.APP_ENV = 'test';
    process.env.POSTGRES_URL = 'postgres://test:test@localhost:5432/tracecase_test';
    process.env.JWT_SIGNING_SECRET = 'test-signing-secret-minimum-32-chars-long';
    _resetCachedEnvForTesting();
    dbMock = new PhaseEDbMock();
    setDbInstanceForTesting(dbMock as any);

    dbMock.principals.push({
      id: OPERATOR_ID,
      role: 'human_operator',
      displayName: 'Test Operator',
      status: 'active',
      isServiceAccount: false,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    setCustomVerifierForTesting(async (token: string) => {
      if (token === OPERATOR_TOKEN) {
        return {
          issuer: 'https://auth.tracecase.test',
          subject: OPERATOR_ID,
          email: 'operator@tracecase.test',
          roles: ['operator', 'human_operator'],
          rawPayload: {},
        };
      }
      throw new Error('Invalid test token');
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    setCustomVerifierForTesting(null);
  });

  async function registerTargetFixture(): Promise<string> {
    const targetReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${OPERATOR_TOKEN}`,
        },
        body: JSON.stringify({
          name: 'Demo Staging Application Phase E',
          baseUrl: 'http://localhost:3005',
          environment: 'staging',
        }),
      })
    );
    const res = await createTargetRoute(targetReq);
    const body = await res.json();
    return body.data.id;
  }

  describe('1. Separate report persistence with command idempotency', () => {
    it('creates a report once and returns cached investigation on duplicate submission with same idempotency key', async () => {
      const targetId = await registerTargetFixture();
      const idempotencyKey = 'key-phase-e-idempotent-001';

      const reportPayload = {
        targetId,
        title: 'Task deletion fails on filter',
        rawDescription: 'Clicking delete on task item does not update view.',
      };

      // First submission: should insert into bug_reports and investigations
      const req1 = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify(reportPayload),
        })
      );

      const res1 = await createReportRoute(req1);
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      expect(body1.data.investigationId).toBeDefined();
      const firstInvestigationId = body1.data.investigationId;
      const firstReportId = body1.data.id;

      expect(dbMock.bugReports.length).toBe(1);
      expect(dbMock.investigations.length).toBe(1);

      // Second submission with the same idempotency key: must replay without creating duplicate rows
      const req2 = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify(reportPayload),
        })
      );

      const res2 = await createReportRoute(req2);
      expect(res2.status).toBe(201);
      const body2 = await res2.json();

      // Must return identical investigation and report identities
      expect(body2.data.investigationId).toBe(firstInvestigationId);
      expect(body2.data.id).toBe(firstReportId);

      // Database rows must not have duplicated
      expect(dbMock.bugReports.length).toBe(1);
      expect(dbMock.investigations.length).toBe(1);
    });

    it('rejects idempotency key reuse with different payload with 409 CONFLICT', async () => {
      const targetId = await registerTargetFixture();
      const idempotencyKey = 'key-phase-e-reused-conflict';

      const req1 = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            targetId,
            title: 'Initial Title Here',
            rawDescription: 'Initial report description of bug.',
          }),
        })
      );

      const res1 = await createReportRoute(req1);
      expect(res1.status).toBe(201);

      // Reusing the same key with different title/payload
      const req2 = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            targetId,
            title: 'Different Title Here',
            rawDescription: 'Completely different description.',
          }),
        })
      );

      const res2 = await createReportRoute(req2);
      expect(res2.status).toBe(409);
      const body2 = await res2.json();
      expect(body2.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('2. Centralized typed planning orchestration outcomes', () => {
    it('authoritatively confirms persisted proposal before routing to approval', async () => {
      const investigationId = '11111111-1111-1111-1111-111111111111';

      // Mock fetchFn simulating requestPlanning returning EXPERIMENT_PROPOSED
      // followed by fetchPlan returning the persisted plan
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'GET' || !init?.method) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  id: 'plan-uuid-1',
                  version: 1,
                  planHash: 'a'.repeat(64),
                },
                version: 1,
                planHash: 'a'.repeat(64),
              }),
          });
        }

        // POST /plan
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                status: 'PROPOSAL_READY',
                plan: {
                  id: 'plan-uuid-1',
                  version: 1,
                  planHash: 'a'.repeat(64),
                },
                workflowRevision: 2,
              },
            }),
        });
      });

      const result = await executePlanningTransition({
        investigationId,
        fetchFn: mockFetch as any,
      });

      expect(result.outcome).toBe('PROPOSAL_READY');
      if (result.outcome === 'PROPOSAL_READY') {
        expect(result.planVersion).toBe(1);
        expect(result.planHash).toBe('a'.repeat(64));
        expect(result.navigationTarget).toBe(`/investigations/${investigationId}/approve`);
      }
    });

    it('rejects proposal navigation if authoritative persistence cannot be confirmed', async () => {
      const investigationId = '22222222-2222-2222-2222-222222222222';

      // Mock fetchFn where POST succeeds but GET /plan fails (unpersisted plan)
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'GET' || !init?.method) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: { code: 'PLAN_NOT_FOUND', message: 'No plan revision exists' } }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                status: 'PROPOSAL_READY',
              },
            }),
        });
      });

      const result = await executePlanningTransition({
        investigationId,
        fetchFn: mockFetch as any,
      });

      // Must NOT route to approval when plan persistence cannot be confirmed
      expect(result.outcome).toBe('ERROR');
      if (result.outcome === 'ERROR') {
        expect(result.code).toBe('PLAN_PERSISTENCE_UNCONFIRMED');
        expect(result.isRetryable).toBe(true);
        expect(result.actionType).toBe('RETRY');
      }
    });

    it('handles CLARIFICATION_NEEDED outcome truthfully with clarify route', async () => {
      const investigationId = '33333333-3333-3333-3333-333333333333';

      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                status: 'CLARIFICATION_NEEDED',
                questions: [{ id: 'q1', questionText: 'Which user account was active?' }],
                workflowRevision: 2,
              },
            }),
        })
      );

      const result = await executePlanningTransition({
        investigationId,
        fetchFn: mockFetch as any,
      });

      expect(result.outcome).toBe('CLARIFICATION_NEEDED');
      if (result.outcome === 'CLARIFICATION_NEEDED') {
        expect(result.questionCount).toBe(1);
        expect(result.navigationTarget).toBe(`/investigations/${investigationId}/clarify`);
      }
    });

    it('handles UNABLE_TO_PROCEED outcome with clear reason and without routing to approval', async () => {
      const investigationId = '44444444-4444-4444-4444-444444444444';

      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                status: 'UNABLE_TO_PROCEED',
                reason: 'Target application returned HTTP 500 on all baseline probes',
                missingPrerequisites: ['Reachable healthy staging server'],
                workflowRevision: 2,
              },
            }),
        })
      );

      const result = await executePlanningTransition({
        investigationId,
        fetchFn: mockFetch as any,
      });

      expect(result.outcome).toBe('UNABLE_TO_PROCEED');
      if (result.outcome === 'UNABLE_TO_PROCEED') {
        expect(result.reason).toContain('Target application returned HTTP 500');
        expect(result.missingPrerequisites).toEqual(['Reachable healthy staging server']);
        expect(result.isRetryable).toBe(true);
      }
    });

    it('scrubs database internals and leaks from error messages', () => {
      const investigationId = '55555555-5555-5555-5555-555555555555';

      const leakError = {
        code: 'INTERNAL_ERROR',
        message: 'PostgresError: syntax error at or near "SELECT" in table investigations',
        status: 500,
      };

      const sanitized = formatSafePlanningError(leakError, investigationId);

      expect(sanitized.outcome).toBe('ERROR');
      expect(sanitized.message).not.toContain('PostgresError');
      expect(sanitized.message).not.toContain('SELECT');
      expect(sanitized.message).not.toContain('table investigations');
      expect(sanitized.isRetryable).toBe(true);
      expect(sanitized.actionType).toBe('RETRY');
    });

    it('maps 401 unauthenticated errors to SIGN_IN actionable state', () => {
      const investigationId = '66666666-6666-6666-6666-666666666666';

      const authError = {
        code: 'AUTHENTICATION_REQUIRED',
        status: 401,
        message: 'JWT token expired or invalid',
      };

      const result = formatSafePlanningError(authError, investigationId);

      expect(result.outcome).toBe('ERROR');
      expect(result.code).toBe('AUTHENTICATION_REQUIRED');
      expect(result.actionType).toBe('SIGN_IN');
      expect(result.message).toContain('Please sign in');
    });
  });
});
