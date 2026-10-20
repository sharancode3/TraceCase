import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createSafeError } from '@/contracts/errors';
import { AuthenticationError, AuthorizationError } from '@/server/auth';
import {
  ConflictError,
  PolicyViolationError,
  NotFoundError,
  ValidationFailedError,
} from './workflow-errors';
import { ServiceUnavailableError } from '@/server/services/ports';
import { idempotencyRepository } from '@/server/db/repositories/idempotency.repository';
import { canonicalJsonStringify } from '@/server/policy/plan-fingerprint';

export function calculateCommandFingerprint(payload: unknown): string {
  return createHash('sha256').update(canonicalJsonStringify(payload), 'utf8').digest('hex');
}

export function handleWorkflowError(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(error.envelope, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return NextResponse.json(error.envelope, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(error.envelope, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json(error.envelope, { status: 409 });
  }
  if (error instanceof PolicyViolationError) {
    return NextResponse.json(error.envelope, { status: 422 });
  }
  if (error instanceof ValidationFailedError) {
    return NextResponse.json(error.envelope, { status: 400 });
  }
  if (error instanceof ServiceUnavailableError) {
    return NextResponse.json(error.envelope, { status: 503 });
  }

  const errRecord = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const message = error instanceof Error ? error.message : String(error);
  const errorCode =
    typeof errRecord?.code === 'string'
      ? errRecord.code
      : Array.isArray(errRecord?.errors) && typeof (errRecord.errors[0] as Record<string, unknown>)?.code === 'string'
      ? ((errRecord.errors[0] as Record<string, unknown>).code as string)
      : undefined;

  if (
    errorCode === 'ECONNREFUSED' ||
    errRecord?.name === 'AggregateError' ||
    message.includes('ECONNREFUSED') ||
    message.includes('connect') ||
    message.includes('database') ||
    message.includes('Connection') ||
    message.includes('Failed to connect')
  ) {
    return NextResponse.json(
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', message || 'Database connection unavailable'),
      { status: 503 }
    );
  }

  return NextResponse.json(
    createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', message),
    { status: 500 }
  );
}

export function extractIdempotencyKey(req: NextRequest, rawBody?: Record<string, unknown>): string | null {
  const headerKey = req.headers.get('x-idempotency-key') || req.headers.get('idempotency-key');
  if (headerKey && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  if (rawBody && typeof rawBody.idempotencyKey === 'string' && rawBody.idempotencyKey.trim().length > 0) {
    return rawBody.idempotencyKey.trim();
  }
  return null;
}

export async function executeWithIdempotency<T>(params: {
  principalId: string;
  idempotencyKey: string | null;
  resourceId: string;
  commandName: string;
  payload: unknown;
  handler: () => Promise<{ status: number; body: T }>;
}): Promise<NextResponse> {
  const { principalId, idempotencyKey, resourceId, commandName, payload, handler } = params;

  if (!idempotencyKey) {
    const { status, body } = await handler();
    return NextResponse.json(body, { status });
  }

  const fingerprint = calculateCommandFingerprint(payload);
  const claim = await idempotencyRepository.claimKey({
    principalId,
    key: idempotencyKey,
    resourceId,
    commandName,
    commandFingerprint: fingerprint,
  });

  if (claim.state === 'CONFLICT') {
    return NextResponse.json(
      createSafeError('CONFLICT_STALE_VERSION', 'IDEMPOTENCY_KEY_REUSED', claim.message),
      { status: 409 }
    );
  }

  if (claim.state === 'IN_PROGRESS') {
    return NextResponse.json(
      createSafeError('CONFLICT_STALE_VERSION', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', claim.message),
      { status: 409 }
    );
  }

  if (claim.state === 'REPLAY') {
    return NextResponse.json(claim.record.responseBody, {
      status: claim.record.responseStatus || 200,
    });
  }

  try {
    const { status, body } = await handler();
    await idempotencyRepository.completeKey({
      principalId,
      key: idempotencyKey,
      responseStatus: status,
      responseBody: body,
    });
    return NextResponse.json(body, { status });
  } catch (err) {
    await idempotencyRepository.releaseOrFailKey(principalId, idempotencyKey);
    throw err;
  }
}
