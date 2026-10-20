import { createSafeError, type SafeErrorEnvelope } from '@/contracts/errors';

export class ConflictError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(message: string, code: string = 'CONFLICT_STALE_VERSION', details?: unknown) {
    super(message);
    this.name = 'ConflictError';
    this.envelope = createSafeError('CONFLICT_STALE_VERSION', code, message, details);
  }
}

export class PolicyViolationError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(message: string, code: string = 'POLICY_VIOLATION', details?: unknown) {
    super(message);
    this.name = 'PolicyViolationError';
    this.envelope = createSafeError('POLICY_VIOLATION', code, message, details);
  }
}

export class NotFoundError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(resourceName: string, id: string) {
    const message = `${resourceName} with ID '${id}' was not found.`;
    super(message);
    this.name = 'NotFoundError';
    this.envelope = createSafeError('NOT_FOUND', 'RESOURCE_NOT_FOUND', message, { resourceName, id });
  }
}

export class ValidationFailedError extends Error {
  public readonly envelope: SafeErrorEnvelope;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationFailedError';
    this.envelope = createSafeError('VALIDATION_FAILED', 'INVALID_PROPOSAL', message, details);
  }
}
