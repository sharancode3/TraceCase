import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { TargetResetClient } from '@/server/verification/target-reset-client';
import type { SafeTargetProfile } from '@/contracts/targets';

describe('P1-06: Scoped Reset Coordination & Readback Verification', () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  // Mutable target fixture state
  let fixtureState: {
    accountBalance: number;
    buildVersion: string;
    resetEndpointStatusCode: number;
    resetDelayMs: number;
    readbackStatusCode: number;
    receivedSecret?: string;
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${serverPort}`);

      if (url.pathname === '/api/test/reset-fixture' && req.method === 'POST') {
        fixtureState.receivedSecret = req.headers['x-tracecase-reset-secret'] as string | undefined;

        if (fixtureState.resetDelayMs > 0) {
          setTimeout(() => {
            res.writeHead(fixtureState.resetEndpointStatusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          }, fixtureState.resetDelayMs);
          return;
        }

        res.writeHead(fixtureState.resetEndpointStatusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: fixtureState.resetEndpointStatusCode === 200 ? 'ok' : 'error' }));
        return;
      }

      if (url.pathname === '/api/test/baseline' && req.method === 'GET') {
        res.writeHead(fixtureState.readbackStatusCode, { 'Content-Type': 'application/json' });
        if (fixtureState.readbackStatusCode === 200) {
          res.end(
            JSON.stringify({
              targetId: 't-local-01',
              environment: 'development',
              buildVersion: fixtureState.buildVersion,
              accountBalance: fixtureState.accountBalance,
            })
          );
        } else {
          res.end(JSON.stringify({ error: 'Readback unavailable' }));
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const getTargetProfile = (overrides?: Partial<SafeTargetProfile>): SafeTargetProfile => ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Local Fixture App',
    baseUrl: serverUrl,
    allowedOrigins: [serverUrl],
    isSandboxVerified: true,
    environment: 'development',
    hasResetCapability: true,
    hasTestAccountConfigured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const expectedBaseline = {
    targetId: 't-local-01',
    environment: 'development',
    buildVersion: 'v1.0.0',
    accountBalance: 100,
  };

  it('blocks attempt 2 when target does not have reset capability configured', async () => {
    const uncapableTarget = getTargetProfile({ hasResetCapability: false });

    const receipt = await TargetResetClient.coordinateReset({
      target: uncapableTarget,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
    });

    expect(receipt.isVerifiedRestored).toBe(false);
    expect(receipt.transportSuccess).toBe(false);
    expect(receipt.readback.discrepancies!.some((d) => d.includes('not have reset capability'))).toBe(true);
  });

  it('blocks outbound requests to forbidden IP ranges or cloud metadata services', async () => {
    const targetWithMetadataBase = getTargetProfile({
      baseUrl: 'http://169.254.169.254',
      allowedOrigins: ['http://169.254.169.254'],
    });

    const receipt = await TargetResetClient.coordinateReset({
      target: targetWithMetadataBase,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
    });

    expect(receipt.isVerifiedRestored).toBe(false);
    expect(receipt.readback.discrepancies!.some((d) => d.includes('outbound scope violation') || d.includes('forbidden'))).toBe(true);
  });

  it('fails restoration when reset returns HTTP 200 but readback reveals dirty state (fake reset proof)', async () => {
    // Target endpoint returns HTTP 200, but fails to actually restore account balance back to 100!
    fixtureState = {
      accountBalance: 50, // dirty
      buildVersion: 'v1.0.0',
      resetEndpointStatusCode: 200,
      resetDelayMs: 0,
      readbackStatusCode: 200,
    };

    const target = getTargetProfile();
    const receipt = await TargetResetClient.coordinateReset({
      target,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
      resetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${serverUrl}/api/test/baseline`,
    });

    expect(receipt.transportSuccess).toBe(true); // HTTP call succeeded
    expect(receipt.baselineEquivalent).toBe(false); // but state was dirty
    expect(receipt.isVerifiedRestored).toBe(false); // must block attempt 2!
    expect(receipt.readback.discrepancies!.some((d) => d.includes('accountBalance'))).toBe(true);
  });

  it('fails restoration when reset transport returns HTTP 500 error', async () => {
    fixtureState = {
      accountBalance: 100,
      buildVersion: 'v1.0.0',
      resetEndpointStatusCode: 500, // DB error during reset
      resetDelayMs: 0,
      readbackStatusCode: 200,
    };

    const target = getTargetProfile();
    const receipt = await TargetResetClient.coordinateReset({
      target,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
      resetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${serverUrl}/api/test/baseline`,
    });

    expect(receipt.transportSuccess).toBe(false);
    expect(receipt.isVerifiedRestored).toBe(false);
    expect(receipt.readback.discrepancies!.some((d) => d.includes('HTTP 500'))).toBe(true);
  });

  it('fails restoration when reset request times out', async () => {
    fixtureState = {
      accountBalance: 100,
      buildVersion: 'v1.0.0',
      resetEndpointStatusCode: 200,
      resetDelayMs: 300, // delay longer than timeout
      readbackStatusCode: 200,
    };

    const target = getTargetProfile();
    const receipt = await TargetResetClient.coordinateReset({
      target,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
      resetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${serverUrl}/api/test/baseline`,
      timeoutMs: 50, // 50ms timeout
    });

    expect(receipt.transportSuccess).toBe(false);
    expect(receipt.isVerifiedRestored).toBe(false);
    expect(receipt.readback.discrepancies!.some((d) => d.includes('timed out'))).toBe(true);
  });

  it('fails restoration when readback endpoint returns HTTP 500 or error', async () => {
    fixtureState = {
      accountBalance: 100,
      buildVersion: 'v1.0.0',
      resetEndpointStatusCode: 200,
      resetDelayMs: 0,
      readbackStatusCode: 500, // readback failed
    };

    const target = getTargetProfile();
    const receipt = await TargetResetClient.coordinateReset({
      target,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
      resetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${serverUrl}/api/test/baseline`,
    });

    expect(receipt.transportSuccess).toBe(true);
    expect(receipt.baselineEquivalent).toBe(false);
    expect(receipt.isVerifiedRestored).toBe(false);
    expect(receipt.readback.discrepancies!.some((d) => d.includes('Readback endpoint returned HTTP 500'))).toBe(true);
  });

  it('successfully verifies restoration when reset succeeds and readback baseline matches', async () => {
    fixtureState = {
      accountBalance: 100, // clean restored balance
      buildVersion: 'v1.0.0',
      resetEndpointStatusCode: 200,
      resetDelayMs: 0,
      readbackStatusCode: 200,
    };

    const target = getTargetProfile();
    const receipt = await TargetResetClient.coordinateReset({
      target,
      investigationId: 'inv-1',
      attemptPairId: 'pair-1',
      expectedBaseline,
      resetEndpoint: `${serverUrl}/api/test/reset-fixture`,
      readbackEndpoint: `${serverUrl}/api/test/baseline`,
      resetAuthSecret: 'secret-auth-token-42',
    });

    expect(fixtureState.receivedSecret).toBe('secret-auth-token-42');
    expect(receipt.transportSuccess).toBe(true);
    expect(receipt.baselineEquivalent).toBe(true);
    expect(receipt.isVerifiedRestored).toBe(true);
    expect(receipt.readback.discrepancies).toHaveLength(0);
    expect(receipt.readback.isEquivalent).toBe(true);
  });
});
