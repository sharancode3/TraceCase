import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as approveRoute } from '@/app/api/v1/investigations/[id]/approve/route';
import { POST as reportsRoute } from '@/app/api/v1/reports/route';
import { GET as investigationsRoute } from '@/app/api/v1/investigations/route';
import { GET as targetsRoute, POST as createTargetRoute } from '@/app/api/v1/targets/route';
import { _resetCachedEnvForTesting } from '@/server/config/env';
import { setCustomPrincipalResolverForTesting } from '@/server/auth';

describe('P1-01: API Scaffold Truthfulness and Safety Boundaries', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetCachedEnvForTesting();
  });

  afterEach(() => {
    setCustomPrincipalResolverForTesting(null);
    process.env = { ...originalEnv };
    _resetCachedEnvForTesting();
  });

  describe('Live Mode (DEV_PREVIEW_MODE=false)', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
      process.env.DEV_PREVIEW_MODE = 'false';
      process.env.DATABASE_URL = 'postgres://invalid:invalid@127.0.0.1:59999/unreachable';
      _resetCachedEnvForTesting();
      setCustomPrincipalResolverForTesting(async (req: Request) => {
        const auth = req.headers.get('authorization');
        if (auth === 'Bearer test-valid-operator-token') {
          return {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'test@tracecase.internal',
            role: 'operator',
            externalIssuer: 'https://auth.tracecase.test',
            externalSubject: 'usr-test-operator-001',
          };
        }
        return null;
      });
    });

    it('rejects unauthenticated requests on live approval route', async () => {
      const investigationId = '11111111-1111-4111-8111-111111111111';
      const req = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${investigationId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investigationId,
            planVersion: 1,
            approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          }),
        })
      );

      const res = await approveRoute(req, { params: Promise.resolve({ id: investigationId }) });
      expect(res.status).toBe(401);
    });

    it('fails closed when database is unreachable on live approval instead of fake live approval (F-05)', async () => {
      const investigationId = '11111111-1111-4111-8111-111111111111';
      const req = new NextRequest(
        new Request(`http://localhost:3000/api/v1/investigations/${investigationId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: 'Bearer test-valid-operator-token',
          },
          body: JSON.stringify({
            investigationId,
            planVersion: 1,
            approvedPlanHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          }),
        })
      );

      const res = await approveRoute(req, { params: Promise.resolve({ id: investigationId }) });
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.error.code).toBe('DATABASE_UNAVAILABLE');
    });

    it('fails closed when database is unreachable on live investigations query instead of returning fake empty array', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/investigations', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-valid-operator-token',
          },
        })
      );

      const res = await investigationsRoute(req);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.error.code).toBe('DATABASE_UNAVAILABLE');
    });

    it('fails closed when database is unreachable on live report creation instead of claiming created: true', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: 'Bearer test-valid-operator-token',
          },
          body: JSON.stringify({
            targetId: '22222222-2222-4222-8222-222222222222',
            title: 'Valid bug report title',
            bugDescription: 'Detailed description of the bug occurring during execution',
            expectedBehavior: 'Expected behavior described clearly',
            observedBehavior: 'Observed behavior described clearly',
          }),
        })
      );

      const res = await reportsRoute(req);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.error.code).toBe('DATABASE_UNAVAILABLE');
    });
  });

  describe('Preview Mode (DEV_PREVIEW_MODE=true)', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
      process.env.DEV_PREVIEW_MODE = 'true';
      _resetCachedEnvForTesting();
    });

    it('requires authentication for approval even when the retired preview flag is enabled', async () => {
      const id = '33333333-3333-4333-8333-333333333333';
      const req = new NextRequest(new Request(`http://localhost:3000/api/v1/investigations/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigationId: id, planVersion: 1, approvedPlanHash: 'a'.repeat(64) }),
      }));
      const res = await approveRoute(req, { params: Promise.resolve({ id }) });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBeDefined();
    });
    it('never returns dummy targets to an unauthenticated preview request', async () => {
      const res = await targetsRoute(new NextRequest('http://localhost:3000/api/v1/targets'));
      expect(res.status).toBe(401);
      expect((await res.json()).data).toBeUndefined();
    });

    it('returns 400 with safe error envelope on malformed JSON payload', async () => {
      const req = new NextRequest(
        new Request('http://localhost:3000/api/v1/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'A', // Too short
            baseUrl: 'not-a-url',
            allowedOrigins: [],
          }),
        })
      );

      const res = await createTargetRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.category).toBe('VALIDATION_FAILED');
      expect(json.error.code).toBe('INVALID_TARGET_PAYLOAD');
    });
  });
});
