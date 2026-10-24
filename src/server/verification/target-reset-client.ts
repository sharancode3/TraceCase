import crypto from 'node:crypto';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { VerifiedResetReceipt } from '@/contracts/reset';
import { TargetNetworkGuard } from '@/server/browser/target-network-guard';
import { BaselineComparator } from './baseline-comparator';

/**
 * Streams response body with early termination if response exceeds safety limit.
 * Prevents memory exhaustion / DoS from malicious or corrupted endpoints.
 */
async function readBoundedResponseBody(
  res: Response,
  maxBytes = 1_000_000
): Promise<{ text?: string; error?: string }> {
  if (!res.body) {
    return { text: '' };
  }

  const reader = res.body.getReader();
  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Stream cancel best effort
          }
          return { error: `Response exceeded ${maxBytes} byte safety limit.` };
        }
        chunks.push(value);
      }
    }
  } catch (err: unknown) {
    return { error: `Failed reading response stream: ${err instanceof Error ? err.message : String(err)}` };
  }

  const fullBuffer = Buffer.concat(chunks);
  return { text: fullBuffer.toString('utf8') };
}

function resolveTargetApiUrl(baseUrl: string, endpointPath: string): string {
  try {
    const origin = new URL(baseUrl).origin;
    return new URL(endpointPath, origin).toString();
  } catch {
    return `${baseUrl.replace(/\/+$/, '')}${endpointPath}`;
  }
}

function appendScopeParam(url: string, scope?: string): string {
  if (!scope || url.includes('scope=')) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('scope', scope);
    return parsed.toString();
  } catch {
    const delim = url.includes('?') ? '&' : '?';
    return `${url}${delim}scope=${encodeURIComponent(scope)}`;
  }
}

export interface CoordinateResetParams {
  target: SafeTargetProfile;
  investigationId: string;
  attemptPairId: string;
  expectedBaseline: Record<string, unknown>;
  resetEndpoint?: string;
  resetAuthSecret?: string;
  readbackEndpoint?: string;
  fixtureScope?: string;
  timeoutMs?: number;
}

export class TargetResetClient {
  /**
   * Coordinates fixture reset and independent baseline verification against the target.
   * Disallows raw SQL or direct DB connections; communicates via authenticated HTTP endpoints.
   */
  public static async coordinateReset(
    params: CoordinateResetParams
  ): Promise<VerifiedResetReceipt> {
    const verifiedAt = new Date().toISOString();
    const receiptId = crypto.randomUUID();

    // 0. Verify target has reset capability configured
    if (!params.target.hasResetCapability && !params.resetEndpoint) {
      return {
        id: receiptId,
        targetId: params.target.id,
        investigationId: params.investigationId,
        attemptNumber: 2,
        transportSuccess: false,
        baselineEquivalent: false,
        isVerifiedRestored: false,
        readback: {
          targetId: params.target.id,
          expectedStateHash: 'unsupported',
          observedStateHash: 'unsupported',
          isEquivalent: false,
          discrepancies: ['Target does not have reset capability configured.'],
          checkedAt: verifiedAt,
        },
        verifiedAt,
      };
    }

    const networkGuard = new TargetNetworkGuard(params.target);
    const timeoutMs = params.timeoutMs ?? 10_000;

    const resetEndpoint =
      params.resetEndpoint ||
      ((params.target as unknown as Record<string, unknown>).fixtureResetEndpoint as string | undefined) ||
      resolveTargetApiUrl(params.target.baseUrl, '/api/test/reset-fixture');

    const baseCandidateReadback =
      params.readbackEndpoint ||
      ((params.target as unknown as Record<string, unknown>).baselineEndpoint as string | undefined) ||
      resolveTargetApiUrl(params.target.baseUrl, '/api/test/readback');
    const baseFallbackReadback = resolveTargetApiUrl(params.target.baseUrl, '/api/test/baseline');

    const candidateReadback = appendScopeParam(baseCandidateReadback, params.fixtureScope);
    const fallbackReadback = appendScopeParam(baseFallbackReadback, params.fixtureScope);

    // 1. Validate destination endpoints against TargetNetworkGuard outbound policy
    try {
      networkGuard.assertUrlAllowed(resetEndpoint);
      networkGuard.assertUrlAllowed(candidateReadback);
      if (!params.readbackEndpoint) {
        networkGuard.assertUrlAllowed(fallbackReadback);
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        id: receiptId,
        targetId: params.target.id,
        investigationId: params.investigationId,
        attemptNumber: 2,
        transportSuccess: false,
        baselineEquivalent: false,
        isVerifiedRestored: false,
        readback: {
          targetId: params.target.id,
          expectedStateHash: 'blocked',
          observedStateHash: 'blocked',
          isEquivalent: false,
          discrepancies: [`Target outbound scope violation: ${reason}`],
          checkedAt: verifiedAt,
        },
        verifiedAt,
      };
    }

    // 2. Dispatch Scoped Reset Command via HTTP POST
    let transportSuccess = false;
    let transportDiscrepancy: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (params.resetAuthSecret) {
        headers['X-TraceCase-Reset-Auth'] = params.resetAuthSecret;
        headers['X-TraceCase-Reset-Secret'] = params.resetAuthSecret;
        headers['Authorization'] = `Bearer ${params.resetAuthSecret}`;
      }

      const res = await fetch(resetEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetId: params.target.id,
          fixtureScope: params.fixtureScope || 'default',
          attemptPairId: params.attemptPairId,
        }),
        redirect: 'error',
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        transportSuccess = true;
      } else {
        transportDiscrepancy = `Reset endpoint returned HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: unknown) {
      transportSuccess = false;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      transportDiscrepancy = isAbort
        ? `Reset request timed out after ${timeoutMs}ms.`
        : `Reset transport failure: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (!transportSuccess) {
      return {
        id: receiptId,
        targetId: params.target.id,
        investigationId: params.investigationId,
        attemptNumber: 2,
        transportSuccess: false,
        baselineEquivalent: false,
        isVerifiedRestored: false,
        readback: {
          targetId: params.target.id,
          expectedStateHash: 'transport_failed',
          observedStateHash: 'none',
          isEquivalent: false,
          discrepancies: [transportDiscrepancy || 'Reset transport failed.'],
          checkedAt: verifiedAt,
        },
        verifiedAt,
      };
    }

    // 3. Independent Readback Verification
    // CRITICAL: A 200 OK from reset does NOT prove restoration without independent readback confirmation!
    let observedBaseline: Record<string, unknown> = {};
    let readbackDiscrepancy: string | undefined;
    let headerBuildId: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (params.resetAuthSecret) {
        headers['X-TraceCase-Reset-Auth'] = params.resetAuthSecret;
        headers['X-TraceCase-Reset-Secret'] = params.resetAuthSecret;
        headers['Authorization'] = `Bearer ${params.resetAuthSecret}`;
      }

      let res = await fetch(candidateReadback, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      });

      if (res.status === 404 && !params.readbackEndpoint) {
        res = await fetch(fallbackReadback, {
          method: 'GET',
          headers,
          redirect: 'error',
          signal: controller.signal,
        });
      }

      clearTimeout(timer);

      if (res.ok) {
        const bodyResult = await readBoundedResponseBody(res, 1_000_000);
        if (bodyResult.error) {
          readbackDiscrepancy = bodyResult.error;
        } else if (bodyResult.text !== undefined) {
          try {
            observedBaseline = JSON.parse(bodyResult.text);
          } catch {
            readbackDiscrepancy = 'Readback endpoint returned malformed JSON.';
          }
        }
        headerBuildId =
          res.headers.get('x-target-build-id') ||
          res.headers.get('target-build-id') ||
          undefined;
      } else {
        readbackDiscrepancy = `Readback endpoint returned HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      readbackDiscrepancy = isAbort
        ? `Readback request timed out after ${timeoutMs}ms.`
        : `Readback transport failure: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (readbackDiscrepancy) {
      return {
        id: receiptId,
        targetId: params.target.id,
        investigationId: params.investigationId,
        attemptNumber: 2,
        transportSuccess: true,
        baselineEquivalent: false,
        isVerifiedRestored: false,
        readback: {
          targetId: params.target.id,
          expectedStateHash: 'readback_failed',
          observedStateHash: 'none',
          isEquivalent: false,
          discrepancies: [readbackDiscrepancy],
          checkedAt: verifiedAt,
        },
        verifiedAt,
      };
    }

    // 4. Compare observed readback against expected baseline
    const declaredVolatiles =
      (params.expectedBaseline.volatileFields as string[] | undefined) ||
      ((params.target as unknown as Record<string, unknown>).volatileFields as string[] | undefined) ||
      [];
    const volatileFields = Array.from(
      new Set([
        ...declaredVolatiles,
        ...(!('buildVersion' in params.expectedBaseline) ? ['buildVersion', 'buildversion'] : []),
        ...(!('buildId' in params.expectedBaseline) ? ['buildId', 'buildid'] : []),
        ...(!('targetBuildId' in params.expectedBaseline) ? ['targetBuildId', 'targetbuildid'] : []),
      ])
    );

    const comparison = BaselineComparator.compareBaselines(
      params.expectedBaseline,
      observedBaseline,
      volatileFields
    );

    const isVerifiedRestored = transportSuccess && comparison.isEquivalent;

    const targetBuildId =
      headerBuildId ||
      (typeof observedBaseline.targetBuildId === 'string'
        ? observedBaseline.targetBuildId
        : undefined) ||
      (typeof observedBaseline.buildId === 'string'
        ? observedBaseline.buildId
        : undefined) ||
      (typeof observedBaseline.buildVersion === 'string'
        ? observedBaseline.buildVersion
        : undefined) ||
      (typeof (params.target as unknown as Record<string, unknown>).buildId === 'string'
        ? ((params.target as unknown as Record<string, unknown>).buildId as string)
        : undefined) ||
      undefined;

    return {
      id: receiptId,
      targetId: params.target.id,
      investigationId: params.investigationId,
      attemptNumber: 2,
      transportSuccess,
      baselineEquivalent: comparison.isEquivalent,
      isVerifiedRestored,
      targetBuildId,
      readback: {
        targetId: params.target.id,
        expectedStateHash: comparison.expectedStateHash,
        observedStateHash: comparison.observedStateHash,
        isEquivalent: comparison.isEquivalent,
        targetBuildId,
        discrepancies: comparison.discrepancies,
        checkedAt: verifiedAt,
      },
      verifiedAt,
    };
  }

  /**
   * Pre-flight baseline verification before Attempt 1.
   * Performs readback without triggering fixture mutation, validating pre-conditions.
   */
  public static async verifyBaselineReadback(params: {
    target: SafeTargetProfile;
    expectedBaseline: Record<string, unknown>;
    readbackEndpoint?: string;
    resetAuthSecret?: string;
    fixtureScope?: string;
    timeoutMs?: number;
  }): Promise<{
    isEquivalent: boolean;
    discrepancies: string[];
    expectedStateHash: string;
    observedStateHash: string;
    targetBuildId?: string;
    observedBaseline?: Record<string, unknown>;
  }> {
    const networkGuard = new TargetNetworkGuard(params.target);
    const timeoutMs = params.timeoutMs ?? 10_000;
    const baseCandidateReadback =
      params.readbackEndpoint ||
      ((params.target as unknown as Record<string, unknown>).baselineEndpoint as string | undefined) ||
      resolveTargetApiUrl(params.target.baseUrl, '/api/test/readback');
    const baseFallbackReadback = resolveTargetApiUrl(params.target.baseUrl, '/api/test/baseline');

    const candidateReadback = appendScopeParam(baseCandidateReadback, params.fixtureScope);
    const fallbackReadback = appendScopeParam(baseFallbackReadback, params.fixtureScope);

    try {
      networkGuard.assertUrlAllowed(candidateReadback);
      if (!params.readbackEndpoint) {
        networkGuard.assertUrlAllowed(fallbackReadback);
      }
    } catch (err: unknown) {
      return {
        isEquivalent: false,
        discrepancies: [`Pre-flight baseline endpoint out of scope: ${err instanceof Error ? err.message : String(err)}`],
        expectedStateHash: 'scope_blocked',
        observedStateHash: 'scope_blocked',
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (params.resetAuthSecret) {
        headers['X-TraceCase-Reset-Auth'] = params.resetAuthSecret;
        headers['X-TraceCase-Reset-Secret'] = params.resetAuthSecret;
        headers['Authorization'] = `Bearer ${params.resetAuthSecret}`;
      }

      let res = await fetch(candidateReadback, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      });

      if (res.status === 404 && !params.readbackEndpoint) {
        res = await fetch(fallbackReadback, {
          method: 'GET',
          headers,
          redirect: 'error',
          signal: controller.signal,
        });
      }
      clearTimeout(timer);

      if (!res.ok) {
        return {
          isEquivalent: false,
          discrepancies: [`Pre-flight readback returned HTTP ${res.status}: ${res.statusText}`],
          expectedStateHash: 'http_error',
          observedStateHash: 'http_error',
        };
      }

      const headerBuildId =
        res.headers.get('x-target-build-id') ||
        res.headers.get('target-build-id') ||
        undefined;

      let observedBaseline: Record<string, unknown> = {};
      const bodyResult = await readBoundedResponseBody(res, 1_000_000);
      if (bodyResult.error) {
        return {
          isEquivalent: false,
          discrepancies: [bodyResult.error],
          expectedStateHash: 'size_limit_exceeded',
          observedStateHash: 'size_limit_exceeded',
        };
      }
      try {
        observedBaseline = JSON.parse(bodyResult.text || '{}');
      } catch {
        return {
          isEquivalent: false,
          discrepancies: ['Pre-flight readback returned malformed JSON.'],
          expectedStateHash: 'malformed_json',
          observedStateHash: 'malformed_json',
        };
      }

      const targetBuildId =
        headerBuildId ||
        (typeof observedBaseline.targetBuildId === 'string'
          ? observedBaseline.targetBuildId
          : undefined) ||
        (typeof observedBaseline.buildId === 'string'
          ? observedBaseline.buildId
          : undefined) ||
        (typeof observedBaseline.buildVersion === 'string'
          ? observedBaseline.buildVersion
          : undefined) ||
        (typeof (params.target as unknown as Record<string, unknown>).buildId === 'string'
          ? ((params.target as unknown as Record<string, unknown>).buildId as string)
          : undefined) ||
        undefined;

      const declaredVolatiles =
        (params.expectedBaseline.volatileFields as string[] | undefined) ||
        ((params.target as unknown as Record<string, unknown>).volatileFields as string[] | undefined) ||
        [];
      const volatileFields = Array.from(
        new Set([
          ...declaredVolatiles,
          ...(!('buildVersion' in params.expectedBaseline) ? ['buildVersion', 'buildversion'] : []),
          ...(!('buildId' in params.expectedBaseline) ? ['buildId', 'buildid'] : []),
          ...(!('targetBuildId' in params.expectedBaseline) ? ['targetBuildId', 'targetbuildid'] : []),
        ])
      );
      const comparison = BaselineComparator.compareBaselines(
        params.expectedBaseline,
        observedBaseline,
        volatileFields
      );
      return {
        isEquivalent: comparison.isEquivalent,
        discrepancies: comparison.discrepancies,
        expectedStateHash: comparison.expectedStateHash,
        observedStateHash: comparison.observedStateHash,
        targetBuildId,
        observedBaseline,
      };
    } catch (err: unknown) {
      return {
        isEquivalent: false,
        discrepancies: [`Pre-flight readback failed: ${err instanceof Error ? err.message : String(err)}`],
        expectedStateHash: 'fetch_error',
        observedStateHash: 'fetch_error',
      };
    }
  }
}
