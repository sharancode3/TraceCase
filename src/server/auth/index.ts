import { createSafeError, type SafeErrorEnvelope } from '@/contracts/errors';

export interface Principal {
  id: string;
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

/**
 * Resolves the authenticated principal from incoming HTTP request headers or cookies.
 * In Stage 0 baseline (unconfigured auth provider), fails closed and returns null.
 * Synthetic preview personas are NEVER accepted as live authenticated principals.
 */
export async function resolvePrincipal(req: Request): Promise<Principal | null> {
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
    // In Stage 0, no live JWT verifier is hooked up yet; fail closed
    if (process.env.NODE_ENV === 'test' && token === 'test-valid-operator-token') {
      return { id: 'usr-test-operator-001', email: 'test@tracecase.internal', role: 'operator' };
    }
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
 */
export function assertResourceOwnership(principal: Principal, ownerId: string): void {
  if (principal.role === 'admin') return; // Admins bypass single-owner restriction
  if (principal.id !== ownerId) {
    throw new AuthorizationError('You do not own this resource.');
  }
}
