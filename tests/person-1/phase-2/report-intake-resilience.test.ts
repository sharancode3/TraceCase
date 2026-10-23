import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getTableName } from 'drizzle-orm';
import { POST as createReportRoute } from '@/app/api/v1/reports/route';
import { POST as createTargetRoute } from '@/app/api/v1/targets/route';
import { DraftReportIntakeSchema, type DraftReportIntake } from '@/contracts/reports';
import { setCustomVerifierForTesting } from '@/server/auth/jwt';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { _resetCachedEnvForTesting } from '@/server/config/env';

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

class ReportIntakeDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
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

        const targetArray = this.getTableArray(table);
        targetArray.push(row);

        return {
          returning: () => Promise.resolve([row]),
          then: (resolve: any) => Promise.resolve([row]).then(resolve),
        };
      },
    };
  }

  update(table: any) {
    return {
      set: (updates: any) => ({
        where: (condition: any) => {
          const targetArray = this.getTableArray(table);
          const checks = extractEqualityChecks(condition);
          let matched = 0;
          for (let i = 0; i < targetArray.length; i++) {
            if (matchesAll(targetArray[i], checks)) {
              targetArray[i] = { ...targetArray[i], ...updates, updatedAt: new Date() };
              matched++;
            }
          }
          return {
            returning: () => Promise.resolve(targetArray.filter((r) => matchesAll(r, checks))),
            then: (resolve: any) => Promise.resolve().then(resolve),
          };
        },
      }),
    };
  }

  delete(table: any) {
    return {
      where: (condition: any) => {
        return Promise.resolve();
      },
    };
  }

  async transaction(cb: (tx: this) => Promise<any>) {
    return cb(this);
  }
}

describe('Phase D: Short, Resilient Report Intake & Schema Compliance', () => {
  let dbMock: ReportIntakeDbMock;
  const OPERATOR_TOKEN = 'mock-operator-token';
  const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
  let targetId: string;

  beforeEach(async () => {
    process.env.APP_ENV = 'test';
    process.env.POSTGRES_URL = 'postgres://test:test@localhost:5432/tracecase_test';
    process.env.JWT_SIGNING_SECRET = 'test-signing-secret-minimum-32-chars-long';
    _resetCachedEnvForTesting();

    dbMock = new ReportIntakeDbMock();
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

    // Create an authorized target
    const targetReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${OPERATOR_TOKEN}`,
        },
        body: JSON.stringify({
          name: 'Demo Staging Application',
          baseUrl: 'http://localhost:3005',
          environment: 'staging',
        }),
      })
    );
    const targetRes = await createTargetRoute(targetReq);
    const targetJson = await targetRes.json();
    targetId = targetJson.data.id;
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    setCustomVerifierForTesting(null);
  });

  describe('Contract: DraftReportIntakeSchema', () => {
    it('accepts minimal reports with only targetId, title, and rawDescription', () => {
      const minimalReport = {
        targetId,
        title: 'Delete button deletes wrong item',
        rawDescription: 'Customer clicked delete on active filter and completed item was deleted',
      };

      const result = DraftReportIntakeSchema.safeParse(minimalReport);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expectedBehavior).toBeUndefined();
        expect(result.data.observedBehavior).toBeUndefined();
        expect(result.data.suspectedSteps).toBeUndefined();
        expect(result.data.browserEnvironment).toBeUndefined();
        expect(result.data.buildVersion).toBeUndefined();
      }
    });

    it('rejects reports with title shorter than 3 characters', () => {
      const shortTitleReport = {
        targetId,
        title: 'No',
        rawDescription: 'Something failed unexpectedly on the task page',
      };
      const result = DraftReportIntakeSchema.safeParse(shortTitleReport);
      expect(result.success).toBe(false);
    });

    it('rejects reports with description shorter than 5 characters', () => {
      const shortDescReport = {
        targetId,
        title: 'Task filter broken',
        rawDescription: 'Bug!',
      };
      const result = DraftReportIntakeSchema.safeParse(shortDescReport);
      expect(result.success).toBe(false);
    });

    it('accepts optional fields without requiring them', () => {
      const fullReport: DraftReportIntake = {
        targetId,
        title: 'Task filter deletes wrong item',
        rawDescription: 'Filter active item deletion symptom description',
        expectedBehavior: 'Active item should be deleted',
        observedBehavior: 'Completed item was deleted instead',
        suspectedSteps: ['1. Go to /tasks', '2. Filter active', '3. Click delete'],
        browserEnvironment: 'Chrome 130 on macOS',
        buildVersion: 'staging-build-001',
      };

      const result = DraftReportIntakeSchema.safeParse(fullReport);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expectedBehavior).toBe('Active item should be deleted');
        expect(result.data.suspectedSteps?.length).toBe(3);
      }
    });
  });

  describe('API Route: POST /api/v1/reports minimal & resilient submission', () => {
    it('successfully persists minimal draft report and returns investigationId', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
          },
          body: JSON.stringify({
            targetId,
            title: 'Minimal intake: clicking filter clears state',
            rawDescription: 'User says clicking active filter resets task counter unexpectedly',
          }),
        })
      );

      const res = await createReportRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      expect(json.created).toBe(true);
      expect(json.mode).toBe('live');
      expect(json.data.id).toBeDefined();
      expect(json.data.investigationId).toBeDefined();
      expect(json.data.targetId).toBe(targetId);
      expect(json.data.title).toBe('Minimal intake: clicking filter clears state');
      expect(json.data.rawDescription).toBe('User says clicking active filter resets task counter unexpectedly');
      expect(json.data.expectedBehavior).toBeNull();
      expect(json.data.observedBehavior).toBeNull();
      expect(json.data.suspectedSteps).toBeNull();
    });

    it('persists report with combined diagnostic logs and optional context', async () => {
      const rawDescription = 'Form submit button hangs on loading state';
      const diagnosticLogs = 'TypeError: Cannot read properties of undefined (reading "id") at task-list.js:42';
      const combinedDescription = `${rawDescription}\n\n[Diagnostic Logs]\n${diagnosticLogs}`;

      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
          },
          body: JSON.stringify({
            targetId,
            title: 'Submit button hang with TypeError',
            rawDescription: combinedDescription,
            expectedBehavior: 'Task item should be added to active list',
            observedBehavior: 'Spinner continues indefinitely without network activity',
            suspectedSteps: ['1. Enter task name', '2. Press Enter key'],
            browserEnvironment: 'Safari 18.1',
            buildVersion: 'sha-987abc',
          }),
        })
      );

      const res = await createReportRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      expect(json.created).toBe(true);
      expect(json.data.rawDescription).toContain('[Diagnostic Logs]');
      expect(json.data.rawDescription).toContain('TypeError: Cannot read properties of undefined');
      expect(json.data.expectedBehavior).toBe('Task item should be added to active list');
      expect(json.data.suspectedSteps).toEqual(['1. Enter task name', '2. Press Enter key']);
      expect(json.data.browserEnvironment).toBe('Safari 18.1');
    });

    it('rejects invalid payload missing rawDescription with 400', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
          },
          body: JSON.stringify({
            targetId,
            title: 'Missing description report',
          }),
        })
      );

      const res = await createReportRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_REPORT_PAYLOAD');
    });
  });
});
