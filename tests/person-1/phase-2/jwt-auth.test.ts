import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as jose from 'jose';
import {
  verifyJwtToken,
  setCustomKeyOrSetForTesting,
  setCustomVerifierForTesting,
  isAuthProviderConfigured,
} from '@/server/auth/jwt';
import {
  resolvePrincipal,
  requireAuthenticatedPrincipal,
  assertResourceOwnership,
  AuthenticationError,
  AuthorizationError,
  Principal,
} from '@/server/auth';
import { _resetCachedEnvForTesting } from '@/server/config/env';

import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';

describe('P1-02: Cryptographic JWT Authentication & Principal Resolution', () => {
  let validKeyPair: jose.GenerateKeyPairResult;
  let attackerKeyPair: jose.GenerateKeyPairResult;
  const originalEnv = { ...process.env };
  const mockPrincipals: any[] = [];

  const ISSUER = 'https://auth.tracecase.test';
  const AUDIENCE = 'https://api.tracecase.test';

  const testDb = {
    insert: () => ({
      values: (val: any) => {
        const record = { id: val.id || crypto.randomUUID(), ...val, createdAt: new Date(), updatedAt: new Date() };
        mockPrincipals.push(record);
        return {
          onConflictDoUpdate: () => ({ returning: async () => [record] }),
          returning: async () => [record],
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([...mockPrincipals]),
          then: (res: any) => Promise.resolve([...mockPrincipals]).then(res),
        }),
      }),
    }),
  };

  beforeAll(async () => {
    validKeyPair = await jose.generateKeyPair('RS256');
    attackerKeyPair = await jose.generateKeyPair('RS256');
  });

  beforeEach(() => {
    mockPrincipals.length = 0;
    setDbInstanceForTesting(testDb);
    _resetCachedEnvForTesting();
    process.env.AUTH_ISSUER = ISSUER;
    process.env.AUTH_AUDIENCE = AUDIENCE;
    process.env.AUTH_JWKS_URI = 'https://auth.tracecase.test/.well-known/jwks.json';
    process.env.DEV_PREVIEW_MODE = 'false';

    // Inject valid public key for verification
    setCustomKeyOrSetForTesting(validKeyPair.publicKey);
    setCustomVerifierForTesting(null);
  });

  afterAll(() => {
    resetDbInstanceForTesting();
    setCustomKeyOrSetForTesting(null);
    setCustomVerifierForTesting(null);
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  it('correctly reports auth provider is configured when keys/env are present', () => {
    expect(isAuthProviderConfigured()).toBe(true);
  });

  it('verifies a validly signed RS256 token and returns verified claims', async () => {
    const token = await new jose.SignJWT({
      email: 'operator@example.com',
      roles: ['operator'],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('usr-alice-789')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(validKeyPair.privateKey);

    const claims = await verifyJwtToken(token);
    expect(claims.subject).toBe('usr-alice-789');
    expect(claims.issuer).toBe(ISSUER);
    expect(claims.email).toBe('operator@example.com');
    expect(claims.roles).toEqual(['operator']);
  });

  it('rejects an expired JWT token with AuthenticationError', async () => {
    const expiredToken = await new jose.SignJWT({
      email: 'operator@example.com',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('usr-expired')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(validKeyPair.privateKey);

    await expect(verifyJwtToken(expiredToken)).rejects.toThrow(AuthenticationError);
  });

  it('rejects a JWT token with wrong issuer', async () => {
    const invalidIssuerToken = await new jose.SignJWT({
      email: 'operator@example.com',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://malicious-issuer.com')
      .setAudience(AUDIENCE)
      .setSubject('usr-bad-iss')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(validKeyPair.privateKey);

    await expect(verifyJwtToken(invalidIssuerToken)).rejects.toThrow(AuthenticationError);
  });

  it('rejects a JWT token with wrong audience', async () => {
    const invalidAudienceToken = await new jose.SignJWT({
      email: 'operator@example.com',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience('https://wrong-audience.com')
      .setSubject('usr-bad-aud')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(validKeyPair.privateKey);

    await expect(verifyJwtToken(invalidAudienceToken)).rejects.toThrow(AuthenticationError);
  });

  it('rejects a JWT token signed by an unauthorized/attacker key pair', async () => {
    const forgedToken = await new jose.SignJWT({
      email: 'forger@evil.com',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('usr-forger')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(attackerKeyPair.privateKey); // Signed with untrusted key

    await expect(verifyJwtToken(forgedToken)).rejects.toThrow(AuthenticationError);
  });

  it('rejects a JWT token missing subject (sub) claim', async () => {
    const missingSubToken = await new jose.SignJWT({
      email: 'operator@example.com',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(validKeyPair.privateKey);

    await expect(verifyJwtToken(missingSubToken)).rejects.toThrow(AuthenticationError);
  });

  it('rejects synthetic preview headers on live authentication resolution', async () => {
    const token = await new jose.SignJWT({ email: 'operator@example.com' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('usr-alice-789')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(validKeyPair.privateKey);

    const req = new Request('http://localhost:3000/api/v1/targets', {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tracecase-preview': 'true', // Synthetic preview header attempted on live endpoint
      },
    });

    const principal = await resolvePrincipal(req);
    expect(principal).toBeNull();
  });

  it('resolves valid authenticated principal from Bearer token in request', async () => {
    const token = await new jose.SignJWT({
      email: 'verified@example.com',
      roles: ['operator'],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('usr-verified-456')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(validKeyPair.privateKey);

    const req = new Request('http://localhost:3000/api/v1/targets', {
      headers: { authorization: `Bearer ${token}` },
    });

    const principal = await requireAuthenticatedPrincipal(req);
    expect(principal.id).toBeDefined();
    expect(principal.externalSubject).toBe('usr-verified-456');
    expect(principal.email).toBe('verified@example.com');
  });

  it('enforces assertResourceOwnership strictly and does not permit admin bypass (P1-02 fix)', () => {
    const regularPrincipal: Principal = {
      id: 'usr-user-1',
      role: 'operator',
    };
    const adminPrincipal: Principal = {
      id: 'usr-admin-1',
      role: 'admin',
    };

    // Owner matches
    expect(() => assertResourceOwnership(regularPrincipal, 'usr-user-1')).not.toThrow();

    // Owner mismatch: operator throws AuthorizationError
    expect(() => assertResourceOwnership(regularPrincipal, 'usr-user-2')).toThrow(AuthorizationError);

    // Owner mismatch: admin ALSO throws AuthorizationError (no blanket bypass)
    expect(() => assertResourceOwnership(adminPrincipal, 'usr-user-2')).toThrow(AuthorizationError);
  });
});
