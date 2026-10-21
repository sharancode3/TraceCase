import crypto from 'node:crypto';
import type { SafeTargetProfile } from '@/contracts/targets';
import type { VerifiedResetReceipt } from '@/contracts/reset';
import { TargetNetworkGuard } from '@/server/browser/target-network-guard';
import { BaselineComparator } from './baseline-comparator';

export interface CoordinateResetParams {
  target: SafeTargetProfile;
  investigationId: string;
  attemptPairId: string;
  expectedBaseline: Record<string, unknown>;
  resetEndpoint?: string;
  resetAuthSecret?: string;
  readbackEndpoint?: string;
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
      `${params.target.baseUrl.replace(/\/+$/, '')}/api/test/reset-fixture`;

    const targetBase = params.target.baseUrl.replace(/\/+$/, '');
    const candidateReadback = params.readbackEndpoint || `${targetBase}/api/test/readback`;
    const fallbackReadback = `${targetBase}/api/test/baseline`;

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
        headers['X-TraceCase-Reset-Secret'] = params.resetAuthSecret;
        headers['X-TraceCase-Reset-Auth'] = params.resetAuthSecret;
        headers['Authorization'] = `Bearer ${params.resetAuthSecret}`;
      }

      const res = await fetch(resetEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetId: params.target.id,
          fixtureScope: 'default',
          attemptPairId: params.attemptPairId,
        }),
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
        headers['X-TraceCase-Reset-Secret'] = params.resetAuthSecret;
        headers['X-TraceCase-Reset-Auth'] = params.resetAuthSecret;
        headers['Authorization'] = `Bearer ${params.resetAuthSecret}`;
      }

      let res = await fetch(candidateReadback, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (res.status === 404 && !params.readbackEndpoint) {
        res = await fetch(fallbackReadback, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
      }

      clearTimeout(timer);

      if (res.ok) {
        observedBaseline = await res.json();
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
    const volatileFields =
      (params.expectedBaseline.volatileFields as string[] | undefined) ||
      ((params.target as unknown as Record<string, unknown>).volatileFields as string[] | undefined);

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
    timeoutMs?: number;
  }): Promise<{
    isEquivalent: boolean;
    discrepancies: string[];
    expectedStateHash: string;
    observedStateHash: string;
    targetBuildId?: string;
  }> {
    const networkGuard = new TargetNetworkGuard(params.target);
    const timeoutMs = params.timeoutMs ?? 10_000;
    const targetBase = params.target.baseUrl.replace(/\/+$/, '');
    const candidateReadback =
      params.readbackEndpoint ||
      ((params.target as unknown as Record<string, unknown>).baselineEndpoint as string | undefined) ||
      `${targetBase}/api/test/readback`;
    const fallbackReadback = `${targetBase}/api/test/baseline`;

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
        headers['X-TraceCase-Reset-Secret'] = params.resetAuthSecret;
        headers['X-TraceCase-Reset-Auth'] = params.resetAuthSecret;
        headers['Authorization'] = `Bearer ${params.resetAuthSecret}`;
      }

      let res = await fetch(candidateReadback, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (res.status === 404 && !params.readbackEndpoint) {
        res = await fetch(fallbackReadback, {
          method: 'GET',
          headers,
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

      const observedBaseline = await res.json();
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

      const volatileFields =
        (params.expectedBaseline.volatileFields as string[] | undefined) ||
        ((params.target as unknown as Record<string, unknown>).volatileFields as string[] | undefined);
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
