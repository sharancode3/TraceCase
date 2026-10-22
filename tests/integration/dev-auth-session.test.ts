import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createDevOperatorToken,
  getDevPublicJwks,
  assertDevAuthAllowed,
} from '@/server/auth/dev-auth';
import { verifyJwtToken } from '@/server/auth/jwt';
import { GET as getJwksRoute } from '@/app/api/dev/jwks/route';
import { GET as getSessionRoute, POST as postSessionRoute, DELETE as deleteSessionRoute } from '@/app/api/dev/session/route';
import { _resetCachedEnvForTesting } from '@/server/config/env';

describe('Local Development Authentication & Session Bootstrap (Section 5)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    (process.env as any).NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH = 'true';
    _resetCachedEnvForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  it('generates a genuine EdDSA signed JWT and verifies it through the standard verifier', async () => {
    const token = await createDevOperatorToken({
      email: 'operator@tracecase.local',
      subject: 'dev-operator-sub',
      roles: ['operator', 'admin'],
    });

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    // Cryptographic verification via standard verifyJwtToken
    const verified = await verifyJwtToken(token);
    expect(verified.subject).toBe('dev-operator-sub');
    expect(verified.email).toBe('operator@tracecase.local');
    expect(verified.roles).toContain('operator');
    expect(verified.roles).toContain('admin');
  });

  it('serves the public JWKS with kid and EdDSA algorithm via GET /api/dev/jwks', async () => {
    const res = await getJwksRoute();
    expect(res.status).toBe(200);

    const json = (await res.json()) as { keys: Array<{ kid?: string; kty?: string; crv?: string }> };
    expect(json.keys).toBeDefined();
    expect(json.keys.length).toBeGreaterThan(0);
    expect(json.keys[0].kty).toBe('OKP');
    expect(json.keys[0].crv).toBe('Ed25519');
    expect(json.keys[0].kid).toBe('dev-operator-key-1');
  });

  it('bootstraps a local development session and sets the tc_session cookie via POST /api/dev/session', async () => {
    const req = new NextRequest('http://localhost:3000/api/dev/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'developer@tracecase.local' }),
    });

    const res = await postSessionRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.token).toBeTruthy();
    expect(json.principal.email).toBe('developer@tracecase.local');

    // Verify cookie was set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('tc_session=');
    expect(setCookie).toContain('Path=/');
  });

  it('clears the tc_session cookie via DELETE /api/dev/session', async () => {
    const res = await deleteSessionRoute();
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('tc_session=;');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('fails closed in production environment and strictly forbids dev authentication', async () => {
    (process.env as any).NODE_ENV = 'production';
    _resetCachedEnvForTesting();

    expect(() => assertDevAuthAllowed()).toThrow(/forbidden in production/);

    const jwksRes = await getJwksRoute();
    expect(jwksRes.status).toBe(404);

    const sessionRes = await postSessionRoute(new NextRequest('http://localhost:3000/api/dev/session', { method: 'POST' }));
    expect(sessionRes.status).toBe(500);
  });
});
