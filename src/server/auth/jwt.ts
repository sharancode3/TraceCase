import * as jose from 'jose';
import { getServerEnv } from '@/server/config/env';
import { AuthenticationError } from './index';
import { getDevKeyPair } from './dev-auth';
import { getOperatorKeyPair, OPERATOR_KEY_ID } from './operator-auth';

export { AuthenticationError };

export interface VerifiedClaims {
  issuer: string;
  subject: string;
  email?: string;
  roles?: string[];
  rawPayload: Record<string, unknown>;
}

export type KeyLikeOrSecret = Parameters<typeof jose.jwtVerify>[1];

let customKeyOrSet: KeyLikeOrSecret | null = null;
let customVerifier: ((token: string) => Promise<VerifiedClaims>) | null = null;
let remoteJwksCache: jose.JWTVerifyGetKey | null = null;

/**
 * Injects a custom key or JWKS function for testing.
 * Strictly used in test harnesses to verify cryptographic signing with ephemeral test keys.
 */
export function setCustomKeyOrSetForTesting(keyOrSet: KeyLikeOrSecret | null): void {
  customKeyOrSet = keyOrSet;
}

/**
 * Injects a custom token verifier for testing.
 */
export function setCustomVerifierForTesting(verifier: ((token: string) => Promise<VerifiedClaims>) | null): void {
  customVerifier = verifier;
}

/**
 * Checks whether an external identity provider is configured in server environment.
 * Requires AUTH_ISSUER, AUTH_AUDIENCE, and AUTH_JWKS_URI, or ENABLE_DEV_AUTH in development.
 */
export function isAuthProviderConfigured(): boolean {
  if (customKeyOrSet !== null || customVerifier !== null) return true;
  try {
    const env = getServerEnv();
    if (env.AUTH_ISSUER && env.AUTH_AUDIENCE && env.AUTH_JWKS_URI) return true;
    if (process.env.NODE_ENV !== 'production' && env.ENABLE_DEV_AUTH) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Cryptographically verifies an incoming JWT token against the configured JWKS / key.
 * Enforces algorithm allowlist (RS256, ES256, EdDSA), issuer, audience, and required expiration.
 * Fails closed if provider is unconfigured or token is invalid.
 * Sanitizes errors so raw token strings, exceptions, or JWKS URLs are never exposed publicly.
 */
export async function verifyJwtToken(token: string): Promise<VerifiedClaims> {
  if (customVerifier) {
    return customVerifier(token);
  }

  const env = getServerEnv();

  // Decode header to detect token signer
  let header: jose.ProtectedHeaderParameters | null = null;
  try {
    header = jose.decodeProtectedHeader(token);
  } catch {
    // Malformed token; will fail verification
  }

  // If a custom test key or JWKS is injected, use it
  let keySource: KeyLikeOrSecret | null = customKeyOrSet;

  if (!keySource) {
    if (header?.kid === OPERATOR_KEY_ID) {
      const opKeys = await getOperatorKeyPair();
      keySource = opKeys.publicKey;
    } else if (header?.kid === 'dev-operator-key-1' && process.env.NODE_ENV !== 'production') {
      const devKeys = await getDevKeyPair();
      keySource = devKeys.publicKey;
    } else if (env.AUTH_ISSUER && env.AUTH_AUDIENCE && env.AUTH_JWKS_URI) {
      if (!remoteJwksCache) {
        remoteJwksCache = jose.createRemoteJWKSet(new URL(env.AUTH_JWKS_URI), {
          timeoutDuration: 5000,
          cooldownDuration: 30000,
        });
      }
      keySource = remoteJwksCache;
    } else if (process.env.NODE_ENV !== 'production' && env.ENABLE_DEV_AUTH) {
      const devKeys = await getDevKeyPair();
      keySource = devKeys.publicKey;
    } else {
      const opKeys = await getOperatorKeyPair();
      keySource = opKeys.publicKey;
    }
  }

  const isOperatorToken = header?.kid === OPERATOR_KEY_ID;
  const effectiveIssuer = env.AUTH_ISSUER || (isOperatorToken ? `${env.APP_URL}/api/auth` : (process.env.NODE_ENV !== 'production' ? `${env.APP_URL}/api/dev` : undefined));
  const effectiveAudience = env.AUTH_AUDIENCE || 'tracecase-api';

  const verifyOptions: jose.JWTVerifyOptions = {
    algorithms: ['RS256', 'ES256', 'EdDSA'],
    clockTolerance: env.AUTH_CLOCK_TOLERANCE_SEC ?? 10,
    issuer: effectiveIssuer,
    audience: effectiveAudience,
  };

  try {
    const { payload } = await jose.jwtVerify(token, keySource as KeyLikeOrSecret, verifyOptions);

    if (typeof payload.exp !== 'number' || Number.isNaN(payload.exp)) {
      throw new AuthenticationError('JWT token is missing required "exp" (expiration) claim.');
    }
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      throw new AuthenticationError('JWT token is missing required non-empty "sub" (subject) claim.');
    }
    if (typeof payload.iss !== 'string' || payload.iss.trim() === '') {
      throw new AuthenticationError('JWT token is missing required non-empty "iss" (issuer) claim.');
    }

    return {
      issuer: payload.iss,
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : ['operator'],
      rawPayload: payload as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    // Mask raw exceptions to prevent leakage of credentials or internals
    throw new AuthenticationError('Authentication failed: token signature or claims validation failed.');
  }
}
