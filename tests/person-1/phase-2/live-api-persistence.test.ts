import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getTableName } from 'drizzle-orm';
import { POST as createTargetRoute, GET as listTargetsRoute } from '@/app/api/v1/targets/route';
import { POST as createReportRoute } from '@/app/api/v1/reports/route';
import { GET as listInvestigationsRoute } from '@/app/api/v1/investigations/route';
import { GET as getInvestigationRoute } from '@/app/api/v1/investigations/[id]/route';
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

class ApiTestDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];
  public experimentPlanRevisions: any[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'experiment_plan_revisions') return this.experimentPlanRevisions;
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
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
                then: (resolve: any) => Promise.resolve([]).then(resolve),
              }),
            }),
          }),
          limit: (n: number) => Promise.resolve(tableArray.slice(0, n)),
          then: (resolve: any, reject: any) => Promise.resolve([...tableArray]).then(resolve, reject),
        };
      },
    };
  }

  insert(table: any) {
    const tableArray = this.getTableArray(table);
    const tableName = getTableName(table);
    return {
      values: (values: any) => {
        const doUpsert = (conflictConfig?: any) => {
          if (tableName === 'principals') {
            const existing = tableArray.find(
              (r) => r.externalIssuer === values.externalIssuer && r.externalSubject === values.externalSubject
            );
            if (existing) {
              if (conflictConfig?.set) {
                Object.assign(existing, conflictConfig.set);
              }
              return [existing];
            }
          }
          const record = {
            id: values.id || crypto.randomUUID(),
            ...values,
            createdAt: values.createdAt || new Date(),
            updatedAt: values.updatedAt || new Date(),
          };
          tableArray.push(record);
          return [record];
        };

        return {
          onConflictDoUpdate: (config: any) => ({
            returning: async () => doUpsert(config),
          }),
          returning: async () => doUpsert(),
        };
      },
    };
  }

  update(table: any) {
    const tableArray = this.getTableArray(table);
    return {
      set: (updateValues: any) => ({
        where: (condition: any) => {
          const executeUpdate = () => {
            const checks = extractEqualityChecks(condition);
            const updated: any[] = [];
            for (let i = 0; i < tableArray.length; i++) {
              if (matchesAll(tableArray[i], checks)) {
                tableArray[i] = { ...tableArray[i], ...updateValues };
                updated.push(tableArray[i]);
              }
            }
            return updated;
          };

          return {
            returning: async () => executeUpdate(),
            then: (resolve: any, reject: any) => Promise.resolve(executeUpdate()).then(resolve, reject),
          };
        },
      }),
    };
  }

  async transaction(cb: (tx: this) => Promise<any>) {
    return cb(this);
  }
}

describe('P1-02: Live API Surface & Real Owned Record Persistence', () => {
  let mockDb: ApiTestDbMock;
  const originalEnv = { ...process.env };

  const ALICE_TOKEN = 'bearer-token-alice';
  const BOB_TOKEN = 'bearer-token-bob';
  const ALICE_SUB = 'usr-alice-uuid-0001';
  const BOB_SUB = 'usr-bob-uuid-0002';

  beforeEach(() => {
    mockDb = new ApiTestDbMock();
    setDbInstanceForTesting(mockDb);

    _resetCachedEnvForTesting();
    process.env.DEV_PREVIEW_MODE = 'false';
    process.env.DATABASE_URL = 'postgres://tc_user:tc_pass@localhost:5432/tracecase';

    setCustomVerifierForTesting(async (token: string) => {
      if (token === ALICE_TOKEN) {
        return {
          issuer: 'https://auth.tracecase.test',
          subject: ALICE_SUB,
          email: 'alice@tracecase.test',
          roles: ['operator'],
          rawPayload: {},
        };
      }
      if (token === BOB_TOKEN) {
        return {
          issuer: 'https://auth.tracecase.test',
          subject: BOB_SUB,
          email: 'bob@tracecase.test',
          roles: ['operator'],
          rawPayload: {},
        };
      }
      throw new Error('Invalid token');
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    setCustomVerifierForTesting(null);
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  it('allows an authenticated principal to create and list an owned target', async () => {
    // 1. Alice creates target
    const createReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${ALICE_TOKEN}`,
        },
        body: JSON.stringify({
          name: 'Staging E-Commerce',
          baseUrl: 'https://staging.shop.test',
          allowedOrigins: ['https://staging.shop.test'],
          isSandboxRequested: true,
          environment: 'staging',
        }),
      })
    );

    const createRes = await createTargetRoute(createReq);
    expect(createRes.status).toBe(201);

    const createJson = await createRes.json();
    expect(createJson.created).toBe(true);
    expect(createJson.mode).toBe('live');
    expect(createJson.data.name).toBe('Staging E-Commerce');
    expect(createJson.data.isSandboxVerified).toBe(false); // Server controls verification

    const targetId = createJson.data.id;

    // 2. Alice lists targets and finds her target
    const aliceListReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
      })
    );
    const aliceListRes = await listTargetsRoute(aliceListReq);
    expect(aliceListRes.status).toBe(200);
    const aliceListJson = await aliceListRes.json();
    expect(aliceListJson.data.length).toBe(1);
    expect(aliceListJson.data[0].id).toBe(targetId);

    // 3. Bob lists targets and sees zero targets
    const bobListReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        headers: { authorization: `Bearer ${BOB_TOKEN}` },
      })
    );
    const bobListRes = await listTargetsRoute(bobListReq);
    expect(bobListRes.status).toBe(200);
    const bobListJson = await bobListRes.json();
    expect(bobListJson.data.length).toBe(0);
  });

  it('allows creating a draft bug report and draft investigation against an owned target', async () => {
    // 1. Alice creates target
    const targetReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${ALICE_TOKEN}`,
        },
        body: JSON.stringify({
          name: 'Target One',
          baseUrl: 'https://target1.test',
          allowedOrigins: ['https://target1.test'],
        }),
      })
    );
    const targetRes = await createTargetRoute(targetReq);
    const targetJson = await targetRes.json();
    const targetId = targetJson.data.id;

    // 2. Alice submits draft bug report (vague intake)
    const reportReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${ALICE_TOKEN}`,
        },
        body: JSON.stringify({
          targetId,
          title: 'Vague intake: form does not submit',
          rawDescription: 'Customer says the submit button spins indefinitely',
        }),
      })
    );

    const reportRes = await createReportRoute(reportReq);
    expect(reportRes.status).toBe(201);
    const reportJson = await reportRes.json();
    expect(reportJson.created).toBe(true);
    expect(reportJson.mode).toBe('live');
    expect(reportJson.data.targetId).toBe(targetId);
    expect(reportJson.data.investigationId).toBeDefined();

    const investigationId = reportJson.data.investigationId;

    // 3. Alice can view her investigation
    const invReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${investigationId}`, {
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
      })
    );
    const invRes = await getInvestigationRoute(invReq, { params: Promise.resolve({ id: investigationId }) });
    expect(invRes.status).toBe(200);
    const invJson = await invRes.json();
    expect(invJson.data.id).toBe(investigationId);
    expect(invJson.data.lifecycleStatus).toBe('DRAFT');

    // 4. Bob cannot view Alice's investigation (returns 404 NOT_FOUND to prevent enumeration)
    const bobInvReq = new NextRequest(
      new Request(`http://localhost:3000/api/v1/investigations/${investigationId}`, {
        headers: { authorization: `Bearer ${BOB_TOKEN}` },
      })
    );
    const bobInvRes = await getInvestigationRoute(bobInvReq, { params: Promise.resolve({ id: investigationId }) });
    expect(bobInvRes.status).toBe(404);
  });

  it('rejects creating a bug report when target is owned by another principal (403)', async () => {
    // Alice creates target
    const targetReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${ALICE_TOKEN}`,
        },
        body: JSON.stringify({
          name: "Alice's Target",
          baseUrl: 'https://alice-exclusive.test',
          allowedOrigins: ['https://alice-exclusive.test'],
        }),
      })
    );
    const targetRes = await createTargetRoute(targetReq);
    const targetJson = await targetRes.json();
    const targetId = targetJson.data.id;

    // Bob attempts to attach report to Alice's target
    const crossReq = new NextRequest(
      new Request('http://localhost:3000/api/v1/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${BOB_TOKEN}`,
        },
        body: JSON.stringify({
          targetId,
          title: 'Unauthorized cross-tenant report',
          rawDescription: 'Attempting to attach report to an unauthorized target',
        }),
      })
    );

    const crossRes = await createReportRoute(crossReq);
    expect(crossRes.status).toBe(403);
    const crossJson = await crossRes.json();
    expect(crossJson.error.category).toBe('UNAUTHORIZED');
  });
});
