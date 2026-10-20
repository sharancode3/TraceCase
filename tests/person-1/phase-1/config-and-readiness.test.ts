import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getServerEnv,
  isDevPreviewEnabled,
  _resetCachedEnvForTesting,
} from '@/server/config/env';
import { publicConfig } from '@/server/config/public';

describe('P1-01: Configuration and Truthful Readiness Reporting', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetCachedEnvForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  it('allows DEV_PREVIEW_MODE in development environment', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.DEV_PREVIEW_MODE = 'true';

    const env = getServerEnv();
    expect(env.DEV_PREVIEW_MODE).toBe(true);
    expect(isDevPreviewEnabled()).toBe(true);
  });

  it('strictly throws fatal error if DEV_PREVIEW_MODE is enabled in production (F-04)', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.DEV_PREVIEW_MODE = 'true';

    expect(() => getServerEnv()).toThrow(
      /DEV_PREVIEW_MODE is strictly forbidden in production/
    );
  });

  it('strictly returns false for isDevPreviewEnabled in production regardless of flags', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.DEV_PREVIEW_MODE = 'true';

    expect(isDevPreviewEnabled()).toBe(false);
  });

  it('guarantees public config contains zero server secrets or connection strings', () => {
    expect(publicConfig.appUrl).toBeDefined();
    expect((publicConfig as unknown as Record<string, unknown>).DATABASE_URL).toBeUndefined();
    expect((publicConfig as unknown as Record<string, unknown>).OPENAI_API_KEY).toBeUndefined();
    expect((publicConfig as unknown as Record<string, unknown>).S3_SECRET_KEY).toBeUndefined();
    expect((publicConfig as unknown as Record<string, unknown>).TARGET_RESET_SECRET).toBeUndefined();
  });
});
