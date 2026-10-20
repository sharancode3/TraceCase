import { describe, it, expect } from 'vitest';
import {
  projectSafeTargetProfile,
  projectSafeModelTargetContext,
  SafeTargetProfileSchema,
  SafeModelTargetContextSchema,
} from '@/contracts/targets';
import { StorageTierSchema } from '@/contracts/evidence';

describe('P1-01: Safe Projections and Secret Sanitization Boundaries', () => {
  it('omits reset auth secrets and account credentials from UI safe target projection', () => {
    const internalTargetRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'TraceCase Demo Tasks Sandbox',
      baseUrl: 'http://localhost:3005',
      allowedOrigins: ['http://localhost:3005'],
      isSandboxVerified: true,
      environment: 'staging',
      testAccountRef: 'test-admin-account-reference',
      fixtureResetEndpoint: 'http://localhost:3005/api/test/reset-fixture',
      fixtureResetAuthSecret: 'super-secret-fixture-reset-token-2026', // SENSITIVE
      internalDatabaseConnection: 'postgres://root:secret@db.internal:5432/tasks', // SENSITIVE
      cloudClusterArn: 'arn:aws:ecs:us-east-1:1234567890:cluster/demo', // SENSITIVE
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    };

    const safeTarget = projectSafeTargetProfile(internalTargetRecord);

    // Verify safe schema passes
    expect(SafeTargetProfileSchema.safeParse(safeTarget).success).toBe(true);

    // Verify sensitive secrets are strictly not present
    expect((safeTarget as Record<string, unknown>).fixtureResetAuthSecret).toBeUndefined();
    expect((safeTarget as Record<string, unknown>).internalDatabaseConnection).toBeUndefined();
    expect((safeTarget as Record<string, unknown>).cloudClusterArn).toBeUndefined();
    expect((safeTarget as Record<string, unknown>).testAccountRef).toBeUndefined();

    // Verify capability booleans are preserved without exposing endpoints or secrets
    expect(safeTarget.hasResetCapability).toBe(true);
    expect(safeTarget.hasTestAccountConfigured).toBe(true);
    expect(safeTarget.isSandboxVerified).toBe(true);
  });

  it('omits infrastructure details from safe model context for AI prompts', () => {
    const internalTargetRecord = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Production Application',
      baseUrl: 'https://app.example.com',
      allowedOrigins: ['https://app.example.com'],
      isSandboxVerified: false,
      environment: 'production',
      fixtureResetAuthSecret: 'forbidden-prod-secret',
      awsVpcId: 'vpc-12345',
    };

    const modelContext = projectSafeModelTargetContext(internalTargetRecord);

    expect(SafeModelTargetContextSchema.safeParse(modelContext).success).toBe(true);
    expect((modelContext as Record<string, unknown>).fixtureResetAuthSecret).toBeUndefined();
    expect((modelContext as Record<string, unknown>).awsVpcId).toBeUndefined();
    expect(modelContext.isSandboxVerified).toBe(false);
  });

  it('does not treat client sandbox request as verified sandbox authority', () => {
    // Client asserted isSandbox: true without server verification
    const unverifiedClientTarget = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Claimed Sandbox',
      baseUrl: 'http://localhost:3005',
      allowedOrigins: ['http://localhost:3005'],
      isSandbox: false, // Server has not verified sandbox isolation
      environment: 'staging',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    };

    const safeTarget = projectSafeTargetProfile(unverifiedClientTarget);
    expect(safeTarget.isSandboxVerified).toBe(false);
  });

  it('enforces that RESTRICTED_RAW storage tier is separated from PUBLIC_SAFE', () => {
    expect(StorageTierSchema.parse('PUBLIC_SAFE')).toBe('PUBLIC_SAFE');
    expect(StorageTierSchema.parse('RESTRICTED_RAW')).toBe('RESTRICTED_RAW');
    expect(() => StorageTierSchema.parse('ANONYMOUS_PUBLIC_INTERNET')).toThrow();
  });
});
