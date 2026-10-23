import { z } from 'zod';
import type {
  SupportedFixtureScope,
  TargetBuildInfo,
  FixtureResetReceipt,
  FixtureReadbackResult,
} from './types';

/**
 * Runtime validation schemas for target HTTP responses.
 * Guarantees that responses adhere to contracts and that public
 * build metadata never leaks internal defect switches (bugModeActive).
 */
export const TargetBuildInfoSchema = z.object({
  applicationName: z.string().min(1),
  buildVersion: z.string().min(1),
  environment: z.enum(['sandbox', 'staging', 'production_mock']),
  serverTimestamp: z.string().min(1),
});

export const TaskItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
});

export const WorkbenchItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  completed: z.boolean(),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']),
  owner: z.string(),
  createdAt: z.string(),
});

export const FixtureResetReceiptSchema = z.object({
  success: z.boolean(),
  receiptId: z.string().min(1),
  timestamp: z.string().min(1),
  fixtureScope: z.enum([
    'two_tasks_one_completed',
    'three_tasks_multi_status',
    'auth_test_user',
    'workbench_work_items',
    'default',
  ]),
  itemsRestored: z.number().int().min(0),
  buildVersion: z.string().min(1),
});

export const FixtureReadbackResultSchema = z.object({
  fixtureScope: z.enum([
    'two_tasks_one_completed',
    'three_tasks_multi_status',
    'auth_test_user',
    'workbench_work_items',
    'default',
  ]),
  buildVersion: z.string().min(1),
  itemCount: z.number().int().min(0),
  items: z.array(z.union([TaskItemSchema, WorkbenchItemSchema])),
  verifiedAt: z.string().min(1),
});

export const CleanupReceiptSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export interface DemoTargetClientOptions {
  baseUrl: string;
  resetSecret: string;
  timeoutMs?: number;
}

export class TargetClientError extends Error {
  public readonly statusCode?: number;
  public readonly code: string;

  constructor(message: string, code: string = 'TARGET_CLIENT_ERROR', statusCode?: number) {
    super(`[TraceCase Target Client] ${code}: ${message}`);
    this.name = 'TargetClientError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TargetUnauthorizedError extends TargetClientError {
  constructor(
    message: string = 'Invalid or missing X-TraceCase-Reset-Auth secret.',
    code: 'UNAUTHORIZED_RESET' | 'UNAUTHORIZED_READBACK' | 'UNAUTHORIZED_CLEANUP' = 'UNAUTHORIZED_RESET'
  ) {
    super(message, code, 401);
  }
}

export class TargetScopeError extends TargetClientError {
  constructor(scope: string, message?: string) {
    super(message || `Invalid or unrecognized fixture scope: ${scope}`, 'UNKNOWN_FIXTURE_SCOPE', 400);
  }
}

export class TargetTimeoutError extends TargetClientError {
  constructor(timeoutMs: number) {
    super(`Target request timed out after ${timeoutMs}ms`, 'TARGET_TIMEOUT', 408);
  }
}

export class TargetConnectionError extends TargetClientError {
  constructor(url: string, originalMessage: string) {
    super(`Failed to connect to target at ${url}: ${originalMessage}`, 'TARGET_CONNECTION_FAILED');
  }
}

export class DemoTargetClient {
  public readonly baseUrl: string;
  private readonly resetSecret: string;
  private readonly timeoutMs: number;

  constructor(options: DemoTargetClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.resetSecret = options.resetSecret;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number = this.timeoutMs
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TargetTimeoutError(timeoutMs);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new TargetConnectionError(url, msg);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Retrieves public target info (build version, application name, environment).
   * Calls /api/build-info and strictly validates response schema at runtime.
   * Public metadata is kept clean of internal defect flags (bugModeActive).
   */
  public async getBuildInfo(): Promise<TargetBuildInfo> {
    const url = `${this.baseUrl}/api/build-info`;
    const res = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TargetClientError(`Failed to fetch build info: ${body}`, 'BUILD_INFO_FAILED', res.status);
    }

    const rawJson = await res.json().catch(() => null);
    const parsed = TargetBuildInfoSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new TargetClientError(
        `Target build info response failed runtime schema validation: ${parsed.error.message}`,
        'INVALID_RESPONSE_SCHEMA',
        res.status
      );
    }

    return parsed.data;
  }

  /**
   * Triggers privileged fixture reset for the specified scope.
   * Returns authoritative FixtureResetReceipt validated against runtime schema.
   */
  public async resetFixture(
    scope: SupportedFixtureScope,
    faultInjection?: 'NONE' | 'PARTIAL_RESET' | 'TIMEOUT_SIMULATION'
  ): Promise<FixtureResetReceipt> {
    const url = `${this.baseUrl}/api/test/reset-fixture`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TraceCase-Reset-Auth': this.resetSecret,
      },
      body: JSON.stringify({
        fixtureScope: scope,
        faultInjection: faultInjection ?? 'NONE',
      }),
    });

    if (res.status === 401) {
      throw new TargetUnauthorizedError();
    }

    if (res.status === 400) {
      const errBody = await res.json().catch(() => ({}));
      const code = (errBody as { error?: { code?: string } })?.error?.code || 'BAD_REQUEST';
      if (code === 'UNKNOWN_FIXTURE_SCOPE') {
        throw new TargetScopeError(scope);
      }
      throw new TargetClientError(`Reset rejected: ${JSON.stringify(errBody)}`, code, 400);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TargetClientError(`Reset failed with status ${res.status}: ${body}`, 'RESET_FAILED', res.status);
    }

    const rawJson = await res.json().catch(() => null);
    const parsed = FixtureResetReceiptSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new TargetClientError(
        `Target reset fixture response failed runtime schema validation: ${parsed.error.message}`,
        'INVALID_RESPONSE_SCHEMA',
        res.status
      );
    }

    return parsed.data;
  }

  /**
   * Reads back the live fixture state directly from the target database/store.
   * Enables independent oracle verification without relying on reset self-reporting.
   */
  public async readbackFixture(scope: SupportedFixtureScope): Promise<FixtureReadbackResult> {
    const url = `${this.baseUrl}/api/test/readback?scope=${encodeURIComponent(scope)}`;
    const res = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'X-TraceCase-Reset-Auth': this.resetSecret,
      },
    });

    if (res.status === 401) {
      throw new TargetUnauthorizedError('Invalid or missing X-TraceCase-Reset-Auth secret for readback.', 'UNAUTHORIZED_READBACK');
    }

    if (res.status === 400) {
      throw new TargetScopeError(scope);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TargetClientError(`Readback failed with status ${res.status}: ${body}`, 'READBACK_FAILED', res.status);
    }

    const rawJson = await res.json().catch(() => null);
    const parsed = FixtureReadbackResultSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new TargetClientError(
        `Target readback fixture response failed runtime schema validation: ${parsed.error.message}`,
        'INVALID_RESPONSE_SCHEMA',
        res.status
      );
    }

    return parsed.data;
  }

  /**
   * Cleans up disposable fixture records after reproduction attempts complete.
   */
  public async cleanupFixture(scope: SupportedFixtureScope): Promise<{ success: boolean; message: string }> {
    const url = `${this.baseUrl}/api/test/cleanup-fixture`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TraceCase-Reset-Auth': this.resetSecret,
      },
      body: JSON.stringify({ fixtureScope: scope }),
    });

    if (res.status === 401) {
      throw new TargetUnauthorizedError('Invalid or missing X-TraceCase-Reset-Auth secret for cleanup.', 'UNAUTHORIZED_CLEANUP');
    }

    if (res.status === 400) {
      throw new TargetScopeError(scope);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TargetClientError(`Cleanup failed with status ${res.status}: ${body}`, 'CLEANUP_FAILED', res.status);
    }

    const rawJson = await res.json().catch(() => null);
    const parsed = CleanupReceiptSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new TargetClientError(
        `Target cleanup fixture response failed runtime schema validation: ${parsed.error.message}`,
        'INVALID_RESPONSE_SCHEMA',
        res.status
      );
    }

    return parsed.data;
  }
}
