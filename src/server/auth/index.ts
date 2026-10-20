import { createSafeError, type SafeErrorEnvelope } from '@/contracts/errors';
import { verifyJwtToken } from './jwt';
import { principalsRepository } from '@/server/db/repositories/principals.repository';
import { isDbConfigured } from '@/server/db';

export interface Principal {
  id: string; // Database primary key (UUID)
  externalIssuer?: string;
  externalSubject?: string;
  email?: string;
  role: 'operator' | 'admin';
  isSynthetic?: boolean;
}

export class AuthenticationError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(message: string = 'Authentication required to perform this action.') {
    super(message);
    this.name = 'AuthenticationError';
    this.envelope = createSafeError('UNAUTHENTICATED', 'AUTH_REQUIRED', message);
  }
}

export class AuthorizationError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(message: string = 'You do not have permission to access or mutate this resource.') {
    super(message);
    this.name = 'AuthorizationError';
    this.envelope = createSafeError('UNAUTHORIZED', 'PERMISSION_DENIED', message);
  }
}

let customPrincipalResolver: ((req: Request) => Promise<Principal | null>) | null = null;

/**
 * Injects a custom principal resolver strictly for test harnesses.
 * Throws if called outside of NODE_ENV === 'test'.
 */
export function setCustomPrincipalResolverForTesting(
  resolver: ((req: Request) => Promise<Principal | null>) | null
): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('[Security] Test principal resolvers cannot be set in non-test environments.');
  }
  customPrincipalResolver = resolver;
}

/**
 * Resolves the authenticated principal from incoming HTTP request headers.
 * Enforces cryptographic JWT verification via jose against configured JWKS / keys.
 * Maps external subject to internal database Principal UUID.
 * Synthetic preview personas are NEVER accepted as live authenticated principals.
 */
export async function resolvePrincipal(req: Request): Promise<Principal | null> {
  // Test hook for isolated integration testing
  if (process.env.NODE_ENV === 'test' && customPrincipalResolver) {
    return customPrincipalResolver(req);
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  // Reject synthetic preview headers on live API endpoints
  if (req.headers.get('x-tracecase-preview') === 'true') {
    return null;
  }

  // Check for bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    // Cryptographic JWT verification via jose
    const claims = await verifyJwtToken(token);

    // If database persistence is configured, resolve/create internal DB principal
    if (isDbConfigured()) {
      try {
        const principalRecord = await principalsRepository.findOrCreateByExternalAuth({
          externalIssuer: claims.issuer,
          externalSubject: claims.subject,
          email: claims.email,
          role: claims.roles?.includes('admin') ? 'admin' : 'operator',
        });
        return {
          id: principalRecord.id,
          email: principalRecord.email ?? undefined,
          role: principalRecord.role as 'operator' | 'admin',
          externalIssuer: principalRecord.externalIssuer,
          externalSubject: principalRecord.externalSubject,
        };
      } catch (dbError) {
        throw new AuthenticationError(
          `Unable to resolve principal in database: ${dbError instanceof Error ? dbError.message : 'Database error'}`
        );
      }
    }

    // Fail closed: without database persistence configured, authenticated mutations are unavailable
    throw new AuthenticationError('Persistence is not configured; cannot establish internal principal authority.');
  }

  return null;
}

/**
 * Enforces that a request has an authenticated principal.
 * Throws AuthenticationError if not resolved.
 */
export async function requireAuthenticatedPrincipal(req: Request): Promise<Principal> {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    throw new AuthenticationError('Valid credentials required for live API mutation.');
  }
  return principal;
}

/**
 * Asserts resource ownership.
 * Fails closed if principal ID does not match owner ID.
 * Admin roles do NOT bypass ownership; strict tenant isolation is enforced.
 */
export function assertResourceOwnership(principal: Principal, ownerId: string): void {
  if (principal.id !== ownerId) {
    throw new AuthorizationError('You do not own this resource.');
  }
}
