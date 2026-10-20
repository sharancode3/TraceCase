import { describe, it, expect } from 'vitest';
import {
  TargetNetworkGuard,
  TargetScopeViolationError,
} from '@/server/browser/target-network-guard';
import type { SafeTargetProfile } from '@/contracts/targets';

describe('P1-05: TargetScope and Network Guard', () => {
  const baseTarget: SafeTargetProfile = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Production Staging App',
    baseUrl: 'https://staging.example.com/app',
    allowedOrigins: ['https://staging.example.com', 'https://api.example.com'],
    isSandboxVerified: true,
    environment: 'staging',
    hasResetCapability: true,
    hasTestAccountConfigured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('allows navigation and subresources within authorized target origins', () => {
    const guard = new TargetNetworkGuard(baseTarget);

    expect(guard.validateUrl('https://staging.example.com/login').isAllowed).toBe(true);
    expect(guard.validateUrl('https://staging.example.com/dashboard/item?id=123').isAllowed).toBe(true);
    expect(guard.validateUrl('https://api.example.com/v1/users').isAllowed).toBe(true);
    expect(guard.validateUrl('about:blank').isAllowed).toBe(true);
  });

  it('strictly blocks cloud provider metadata services (AWS, GCP, Azure)', () => {
    const guard = new TargetNetworkGuard(baseTarget);

    const blockedIps = [
      'http://169.254.169.254/latest/meta-data/',
      'https://169.254.169.254/computeMetadata/v1/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://169.254.169.253/metadata',
      'http://100.100.100.200/latest/meta-data',
    ];

    for (const url of blockedIps) {
      const result = guard.validateUrl(url);
      expect(result.isAllowed).toBe(false);
      expect(result.reason).toContain('Cloud instance metadata');
      expect(() => guard.assertUrlAllowed(url)).toThrow(TargetScopeViolationError);
    }
  });

  it('blocks loopback and local network when target is not a local dev environment', () => {
    const guard = new TargetNetworkGuard(baseTarget);

    const localAddresses = [
      'http://localhost:3000/admin',
      'http://127.0.0.1:8080/secrets',
      'http://0.0.0.0:5432/',
      'http://[::1]:9000/info',
    ];

    for (const url of localAddresses) {
      const result = guard.validateUrl(url);
      expect(result.isAllowed).toBe(false);
      expect(result.reason).toContain('Local and loopback network addresses are blocked');
    }
  });

  it('permits loopback addresses only when target is explicitly configured for localhost', () => {
    const localTarget: SafeTargetProfile = {
      ...baseTarget,
      baseUrl: 'http://localhost:3000/app',
      allowedOrigins: ['http://localhost:3000'],
      environment: 'development',
    };

    const guard = new TargetNetworkGuard(localTarget);
    expect(guard.validateUrl('http://localhost:3000/app/test').isAllowed).toBe(true);
    // Still blocks metadata IPs even in local mode
    expect(guard.validateUrl('http://169.254.169.254/meta-data').isAllowed).toBe(false);
  });

  it('strictly rejects non-http protocols (file, ftp, javascript, gopher)', () => {
    const guard = new TargetNetworkGuard(baseTarget);

    expect(guard.validateUrl('file:///etc/passwd').isAllowed).toBe(false);
    expect(guard.validateUrl('ftp://ftp.example.com/dump.sql').isAllowed).toBe(false);
    expect(guard.validateUrl('javascript:alert(1)').isAllowed).toBe(false);
  });

  it('rejects URLs with embedded user credentials', () => {
    const guard = new TargetNetworkGuard(baseTarget);

    const result = guard.validateUrl('https://admin:secret@staging.example.com/app');
    expect(result.isAllowed).toBe(false);
    expect(result.reason).toContain('embedded user credentials');
  });

  it('rejects third-party egress outside allowed origins list', () => {
    const guard = new TargetNetworkGuard(baseTarget);

    const thirdPartyUrls = [
      'https://malicious-site.com/steal',
      'https://google.com/search',
      'https://aws.amazon.com/',
      'https://staging.example.com.attacker.com/page',
    ];

    for (const url of thirdPartyUrls) {
      const result = guard.validateUrl(url);
      expect(result.isAllowed).toBe(false);
      expect(result.reason).toContain('is not in authorized target origins');
    }
  });
});
