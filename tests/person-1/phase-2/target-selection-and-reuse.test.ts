import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getTableName } from 'drizzle-orm';
import { POST as createTargetRoute, GET as listTargetsRoute } from '@/app/api/v1/targets/route';
import { POST as createReportRoute } from '@/app/api/v1/reports/route';
import {
  parseAndNormalizeTargetUrl,
  sanitizeInternalReturnPath,
} from '@/contracts/targets';
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

class TargetSelectionDbMock {
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

describe('Phase C: Target Reuse, Exact Report Selection & Return Path Safety', () => {
  let dbMock: TargetSelectionDbMock;
  const ALICE_TOKEN = 'mock-alice-token';
  const BOB_TOKEN = 'mock-bob-token';
  const ALICE_ID = '00000000-0000-0000-0000-00000000000a';
  const BOB_ID = '00000000-0000-0000-0000-00000000000b';

  beforeEach(() => {
    process.env.APP_ENV = 'test';
    process.env.POSTGRES_URL = 'postgres://test:test@localhost:5432/tracecase_test';
    process.env.JWT_SIGNING_SECRET = 'test-signing-secret-minimum-32-chars-long';
    _resetCachedEnvForTesting();

    dbMock = new TargetSelectionDbMock();
    setDbInstanceForTesting(dbMock as any);

    dbMock.principals.push(
      {
        id: ALICE_ID,
        role: 'human_operator',
        displayName: 'Alice Operator',
        status: 'active',
        isServiceAccount: false,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: BOB_ID,
        role: 'human_operator',
        displayName: 'Bob Operator',
        status: 'active',
        isServiceAccount: false,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    setCustomVerifierForTesting(async (token: string) => {
      if (token === ALICE_TOKEN) {
        return {
          issuer: 'https://auth.tracecase.test',
          subject: ALICE_ID,
          email: 'alice@tracecase.test',
          roles: ['operator', 'human_operator'],
          rawPayload: {},
        };
      }
      if (token === BOB_TOKEN) {
        return {
          issuer: 'https://auth.tracecase.test',
          subject: BOB_ID,
          email: 'bob@tracecase.test',
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

  describe('Contract: sanitizeInternalReturnPath', () => {
    it('accepts valid internal relative paths', () => {
      expect(sanitizeInternalReturnPath('/investigations/new')).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('/targets?filter=staging')).toBe('/targets?filter=staging');
      expect(sanitizeInternalReturnPath('/investigations/new?targetId=123')).toBe('/investigations/new?targetId=123');
    });

    it('rejects protocol-relative open redirect URLs (//evil.com)', () => {
      expect(sanitizeInternalReturnPath('//evil.com')).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('//evil.com/phish', '/custom-fallback')).toBe('/custom-fallback');
    });

    it('rejects external URLs with schemes (http, https, javascript, data)', () => {
      expect(sanitizeInternalReturnPath('https://evil.com')).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('http://evil.com')).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('javascript:alert(1)')).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('data:text/html,evil')).toBe('/investigations/new');
    });

    it('rejects paths containing backslashes or traversal characters', () => {
      expect(sanitizeInternalReturnPath('/\\evil.com')).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('\\evil.com')).toBe('/investigations/new');
    });

    it('returns fallback for empty, null, or undefined paths', () => {
      expect(sanitizeInternalReturnPath(null)).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath(undefined)).toBe('/investigations/new');
      expect(sanitizeInternalReturnPath('   ')).toBe('/investigations/new');
    });
  });

  describe('Intentional Variant Preservation without Auto-Deduplication', () => {
    it('allows creating intentional environment variants for the same origin without mutating existing profiles', async () => {
      // 1. Alice creates Staging target at localhost:3005
      const req1 = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Demo App Staging',
            baseUrl: 'http://localhost:3005',
            environment: 'staging',
          }),
        })
      );
      const res1 = await createTargetRoute(req1);
      expect(res1.status).toBe(201);
      const json1 = await res1.json();
      const targetId1 = json1.data.id;

      // 2. Alice intentionally registers a Development variant for the same origin localhost:3005
      const req2 = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Demo App Local Dev Variant',
            baseUrl: 'http://localhost:3005',
            environment: 'development',
          }),
        })
      );
      const res2 = await createTargetRoute(req2);
      expect(res2.status).toBe(201);
      const json2 = await res2.json();
      const targetId2 = json2.data.id;

      // Both IDs must be unique and neither record should be overwritten or merged
      expect(targetId1).not.toBe(targetId2);

      // Verify Alice has both distinct profiles in listTargets
      const listReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        })
      );
      const listRes = await listTargetsRoute(listReq);
      const listJson = await listRes.json();
      expect(listJson.data.length).toBe(2);

      const target1 = listJson.data.find((t: any) => t.id === targetId1);
      const target2 = listJson.data.find((t: any) => t.id === targetId2);
      expect(target1.name).toBe('Demo App Staging');
      expect(target1.environment).toBe('staging');
      expect(target2.name).toBe('Demo App Local Dev Variant');
      expect(target2.environment).toBe('development');
    });

    it('strictly isolates target profiles by tenant (Bob cannot see or collide with Alice targets)', async () => {
      // Alice creates target
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Alice Private Target',
            baseUrl: 'https://private.alice.corp',
            environment: 'staging',
          }),
        })
      );
      await createTargetRoute(req);

      // Bob lists his targets
      const bobListReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          headers: { authorization: `Bearer ${BOB_TOKEN}` },
        })
      );
      const bobRes = await listTargetsRoute(bobListReq);
      const bobJson = await bobRes.json();
      expect(bobJson.data.length).toBe(0);
    });
  });

  describe('Report Selection & Target Ownership Validation', () => {
    it('rejects report intake when target ID belongs to another tenant', async () => {
      // 1. Alice creates target
      const targetReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Alice Target',
            baseUrl: 'https://staging.alice.test',
          }),
        })
      );
      const targetRes = await createTargetRoute(targetReq);
      const targetJson = await targetRes.json();
      const aliceTargetId = targetJson.data.id;

      // 2. Bob attempts to create a bug report referencing Alice targetId
      const reportReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${BOB_TOKEN}`,
          },
          body: JSON.stringify({
            targetId: aliceTargetId,
            title: 'Unauthorized cross-tenant submission attempt',
            rawDescription: 'Customer reported an error on unauthorized target',
          }),
        })
      );

      const reportRes = await createReportRoute(reportReq);
      // Fails with 403 FORBIDDEN (fail-closed, does not allow cross-tenant report creation)
      expect(reportRes.status).toBe(403);
      const reportJson = await reportRes.json();
      expect(reportJson.error.code).toBe('PERMISSION_DENIED');
    });

    it('rejects report intake when targetId is completely invalid / non-existent', async () => {
      const reportReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            targetId: '00000000-0000-0000-0000-000000000000',
            title: 'Stale target ID report',
            rawDescription: 'Customer report with stale target ID',
          }),
        })
      );

      const reportRes = await createReportRoute(reportReq);
      expect(reportRes.status).toBe(403);
      const reportJson = await reportRes.json();
      expect(reportJson.error.code).toBe('PERMISSION_DENIED');
    });

    it('accepts report intake when targetId belongs to the authenticated user', async () => {
      // Alice creates target
      const targetReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Alice Owned Target',
            baseUrl: 'https://staging.alice.test',
          }),
        })
      );
      const targetRes = await createTargetRoute(targetReq);
      const targetJson = await targetRes.json();
      const aliceTargetId = targetJson.data.id;

      // Alice files bug report against her own target
      const reportReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${ALICE_TOKEN}`,
          },
          body: JSON.stringify({
            targetId: aliceTargetId,
            title: 'Filter button does not update active count',
            rawDescription: 'Clicking filter button leaves counter unchanged',
          }),
        })
      );

      const reportRes = await createReportRoute(reportReq);
      expect(reportRes.status).toBe(201);
      const reportJson = await reportRes.json();
      expect(reportJson.created).toBe(true);
      expect(reportJson.data.targetId).toBe(aliceTargetId);
      expect(reportJson.data.investigationId).toBeDefined();
    });
  });
});
