import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import * as jose from 'jose';
import {
  verifyJwtToken,
  AuthenticationError,
  setCustomKeyOrSetForTesting,
  setCustomVerifierForTesting,
} from '@/server/auth/jwt';
import { _resetCachedEnvForTesting } from '@/server/config/env';

describe('P1-03: Hardened JWT Claims and Error Masking', () => {
  const originalEnv = { ...process.env };
  let keyPair: jose.GenerateKeyPairResult;

  beforeAll(async () => {
    keyPair = await jose.generateKeyPair('RS256');
  });

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    process.env.DEV_PREVIEW_MODE = 'false';
    process.env.AUTH_JWKS_URI = 'https://auth.tracecase.test/.well-known/jwks.json';
    process.env.AUTH_ISSUER = 'https://auth.tracecase.test';
    process.env.AUTH_AUDIENCE = 'https://api.tracecase.test';
    _resetCachedEnvForTesting();
    setCustomKeyOrSetForTesting(keyPair.publicKey);
  });

  afterEach(() => {
    setCustomKeyOrSetForTesting(null);
    setCustomVerifierForTesting(null);
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  it('rejects tokens when AUTH_AUDIENCE is missing from server configuration', async () => {
    setCustomKeyOrSetForTesting(null); // Force reading env
    delete process.env.AUTH_AUDIENCE;
    _resetCachedEnvForTesting();

    await expect(verifyJwtToken('dummy.jwt.token')).rejects.toThrow(AuthenticationError);
  });

  it('rejects tokens with missing or empty sub claim', async () => {
    // Generate valid signature but empty subject
    const token = await new jose.SignJWT({
      iss: 'https://auth.tracecase.test',
      aud: 'https://api.tracecase.test',
      sub: '',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);

    await expect(verifyJwtToken(token)).rejects.toThrow(
      'JWT token is missing required non-empty "sub" (subject) claim.'
    );
  });

  it('rejects tokens with missing expiration claim', async () => {
    // Generate valid signature and sub, but no exp claim
    const token = await new jose.SignJWT({
      iss: 'https://auth.tracecase.test',
      aud: 'https://api.tracecase.test',
      sub: 'usr-123',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(keyPair.privateKey);

    await expect(verifyJwtToken(token)).rejects.toThrow(
      'JWT token is missing required "exp" (expiration) claim.'
    );
  });

  it('masks raw token content and secret data in error envelopes', async () => {
    const sensitiveRawToken = 'secret-header.secret-payload.super-secret-signature';

    try {
      // Token is invalid signature against keyPair
      await verifyJwtToken(sensitiveRawToken);
      expect.unreachable('Should have thrown AuthenticationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      const authErr = err as AuthenticationError;
      // Raw sensitive token must NOT be leaked in error message or envelope
      expect(authErr.message).not.toContain(sensitiveRawToken);
      expect(JSON.stringify(authErr.envelope)).not.toContain(sensitiveRawToken);
      expect(authErr.envelope.error.category).toBe('UNAUTHENTICATED');
    }
  });
});
