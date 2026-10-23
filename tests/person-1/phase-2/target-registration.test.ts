import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getTableName } from 'drizzle-orm';
import { POST as createTargetRoute, GET as listTargetsRoute } from '@/app/api/v1/targets/route';
import {
  parseAndNormalizeTargetUrl,
  projectSafeTargetProfile,
  SafeTargetProfileSchema,
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

class TargetRegistrationDbMock {
  public principals: any[] = [];
  public targets: any[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
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
}

describe('Phase B: Target Registration Contracts, SSRF Protection, and Persistence', () => {
  let dbMock: TargetRegistrationDbMock;
  const OPERATOR_TOKEN = 'mock-operator-token';
  const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    process.env.APP_ENV = 'test';
    process.env.POSTGRES_URL = 'postgres://test:test@localhost:5432/tracecase_test';
    process.env.JWT_SIGNING_SECRET = 'test-signing-secret-minimum-32-chars-long';
    _resetCachedEnvForTesting();

    dbMock = new TargetRegistrationDbMock();
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

  describe('Contract: parseAndNormalizeTargetUrl', () => {
    it('normalizes valid HTTP and HTTPS URLs', () => {
      const res1 = parseAndNormalizeTargetUrl('http://localhost:3005/');
      expect(res1.isValid).toBe(true);
      expect(res1.normalizedOrigin).toBe('http://localhost:3005');
      expect(res1.normalizedBaseUrl).toBe('http://localhost:3005');

      const res2 = parseAndNormalizeTargetUrl('https://staging.example.com/app/dashboard/');
      expect(res2.isValid).toBe(true);
      expect(res2.normalizedOrigin).toBe('https://staging.example.com');
      expect(res2.normalizedBaseUrl).toBe('https://staging.example.com/app/dashboard');
    });

    it('rejects unsupported protocols like ftp or javascript', () => {
      const resFtp = parseAndNormalizeTargetUrl('ftp://example.com/app');
      expect(resFtp.isValid).toBe(false);
      expect(resFtp.error).toContain('is not supported');

      const resJs = parseAndNormalizeTargetUrl('javascript:alert(1)');
      expect(resJs.isValid).toBe(false);
    });

    it('rejects embedded user credentials (password safety)', () => {
      const res = parseAndNormalizeTargetUrl('http://admin:secret123@localhost:3005');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('must not contain embedded user credentials or passwords');
    });

    it('rejects SSRF cloud provider metadata IP addresses', () => {
      const resAws = parseAndNormalizeTargetUrl('http://169.254.169.254/latest/meta-data');
      expect(resAws.isValid).toBe(false);
      expect(resAws.error).toContain('metadata IP addresses are strictly prohibited');

      const resGcp = parseAndNormalizeTargetUrl('http://metadata.google.internal/computeMetadata/v1');
      expect(resGcp.isValid).toBe(false);
      expect(resGcp.error).toContain('metadata IP addresses are strictly prohibited');
    });

    it('handles empty or whitespace-only inputs cleanly', () => {
      const res = parseAndNormalizeTargetUrl('   ');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('URL cannot be empty');
    });
  });

  describe('Contract: projectSafeTargetProfile', () => {
    it('projects only safe fields and strictly excludes secrets', () => {
      const rawTarget = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Safe Staging Target',
        baseUrl: 'https://staging.example.com',
        allowedOrigins: ['https://staging.example.com'],
        isSandboxVerified: true,
        isSandboxRequested: true,
        environment: 'staging',
        fixtureResetEndpoint: 'https://staging.example.com/api/test/reset',
        fixtureResetAuthSecret: 'SUPER_SECRET_TOKEN_NEVER_EXPOSE',
        testAccountRef: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const safe = projectSafeTargetProfile(rawTarget);
      expect(SafeTargetProfileSchema.safeParse(safe).success).toBe(true);
      expect((safe as any).fixtureResetAuthSecret).toBeUndefined();
      expect(safe.hasResetCapability).toBe(true);
      expect(safe.hasTestAccountConfigured).toBe(true);
      expect(safe.isSandboxVerified).toBe(true);
    });
  });

  describe('API Route: POST /api/v1/targets and GET /api/v1/targets', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Test Target',
            baseUrl: 'http://localhost:3005',
          }),
        })
      );
      const res = await createTargetRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects invalid or SSRF metadata URLs with 400', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Evil Metadata Target',
            baseUrl: 'http://169.254.169.254',
          }),
        })
      );
      const res = await createTargetRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_TARGET_URL');
      expect(json.error.message).toContain('metadata IP addresses are strictly prohibited');
    });

    it('rejects URLs with embedded credentials with 400', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Credentials Target',
            baseUrl: 'http://admin:pass123@localhost:3005',
          }),
        })
      );
      const res = await createTargetRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_TARGET_URL');
      expect(json.error.message).toContain('embedded user credentials or passwords');
    });

    it('successfully registers target, normalizes URL, and returns persisted profile', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${OPERATOR_TOKEN}`,
          },
          body: JSON.stringify({
            name: 'Demo App Staging',
            baseUrl: 'http://localhost:3005/',
            environment: 'staging',
            isSandboxRequested: true,
          }),
        })
      );

      const res = await createTargetRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.created).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.name).toBe('Demo App Staging');
      expect(json.data.baseUrl).toBe('http://localhost:3005');
      expect(json.data.allowedOrigins).toEqual(['http://localhost:3005']);
      // Server policy controls verification (isSandboxRequested is true, isSandboxVerified is false without explicit allowlist)
      expect(json.data.isSandboxRequested).toBe(true);
      expect(json.data.isSandboxVerified).toBe(false);

      const targetId = json.data.id;

      // Verify subsequent GET returns the persisted profile
      const listReq = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
        })
      );
      const listRes = await listTargetsRoute(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.data.length).toBe(1);
      expect(listJson.data[0].id).toBe(targetId);
      expect(listJson.data[0].baseUrl).toBe('http://localhost:3005');
      expect(listJson.data[0].hasResetCapability).toBe(true); // localhost:3005 gets default reset hook
    });
  });
});
