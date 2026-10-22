import { describe, it, expect } from 'vitest';
import {
  sanitizeNetworkHeaders,
  sanitizeUrl,
  filterConsoleLogs,
  filterNetworkTraces,
  getEvidenceAvailability,
  buildReproductionPackage,
  CANONICAL_TC1_CONSOLE_LOGS,
  CANONICAL_TC1_NETWORK_TRACES,
} from '@/features/investigations/evidence-presentation';
import {
  SYNTHETIC_INVESTIGATIONS_CATALOG,
  SYNTHETIC_PLAN_V1,
  SYNTHETIC_EVIDENCE_MANIFEST_TC1,
} from '@/dev/fixtures';

describe('Evidence Presentation & Developer Export (P3-06)', () => {
  describe('Network Header Sanitization', () => {
    it('redacts sensitive authorization and cookie headers', () => {
      const rawHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-secret-token-12345',
        Cookie: 'session_id=abcdef123456; theme=light',
        'X-Api-Key': 'ak_live_abcdef987654',
        Accept: 'application/json',
      };

      const sanitized = sanitizeNetworkHeaders(rawHeaders);

      expect(sanitized['Content-Type']).toBe('application/json');
      expect(sanitized['Accept']).toBe('application/json');
      expect(sanitized['Authorization']).toBe('[REDACTED_HEADER]');
      expect(sanitized['Cookie']).toBe('[REDACTED_HEADER]');
      expect(sanitized['X-Api-Key']).toBe('[REDACTED_HEADER]');
    });

    it('case-insensitively masks header keys', () => {
      const rawHeaders = {
        authorization: 'Bearer secret',
        COOKIE: 'secret_cookie',
        'x-access-token': 'jwt_secret',
      };

      const sanitized = sanitizeNetworkHeaders(rawHeaders);
      expect(sanitized['authorization']).toBe('[REDACTED_HEADER]');
      expect(sanitized['COOKIE']).toBe('[REDACTED_HEADER]');
      expect(sanitized['x-access-token']).toBe('[REDACTED_HEADER]');
    });
  });

  describe('Console Log Filtering', () => {
    it('returns all logs when search query is empty', () => {
      const filtered = filterConsoleLogs(CANONICAL_TC1_CONSOLE_LOGS, '');
      expect(filtered.length).toBe(CANONICAL_TC1_CONSOLE_LOGS.length);
    });

    it('filters logs by message content case-insensitively', () => {
      const filtered = filterConsoleLogs(CANONICAL_TC1_CONSOLE_LOGS, 'array index offset');
      expect(filtered.length).toBe(1);
      expect(filtered[0].level).toBe('WARN');
      expect(filtered[0].message).toContain('Array index offset triggered');
    });

    it('filters logs by log level', () => {
      const errorLogs = filterConsoleLogs(CANONICAL_TC1_CONSOLE_LOGS, 'ERROR');
      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0].level).toBe('ERROR');

      const infoLogs = filterConsoleLogs(CANONICAL_TC1_CONSOLE_LOGS, 'INFO');
      expect(infoLogs.length).toBe(4);
    });

    it('returns empty array when no log entries match', () => {
      const filtered = filterConsoleLogs(CANONICAL_TC1_CONSOLE_LOGS, 'non-existent-search-term');
      expect(filtered).toEqual([]);
    });
  });

  describe('Network Trace Filtering', () => {
    it('returns all traces when search query is empty', () => {
      const filtered = filterNetworkTraces(CANONICAL_TC1_NETWORK_TRACES, '');
      expect(filtered.length).toBe(CANONICAL_TC1_NETWORK_TRACES.length);
    });

    it('filters by HTTP method', () => {
      const deleteTraces = filterNetworkTraces(CANONICAL_TC1_NETWORK_TRACES, 'DELETE');
      expect(deleteTraces.length).toBe(1);
      expect(deleteTraces[0].url).toContain('/api/tasks/task-001');
    });

    it('filters by URL keyword', () => {
      const taskTraces = filterNetworkTraces(CANONICAL_TC1_NETWORK_TRACES, 'api/tasks');
      expect(taskTraces.length).toBe(2);
    });

    it('filters by failure text and handles transport failures without throwing', () => {
      const traceWithFailure = [
        ...CANONICAL_TC1_NETWORK_TRACES,
        {
          id: 'net-err',
          method: 'DELETE',
          url: 'http://localhost:3005/api/tasks/task-b',
          isTransportFailure: true,
          failureText: 'net::ERR_ABORTED',
        },
      ];
      const result = filterNetworkTraces(traceWithFailure, 'ERR_ABORTED');
      expect(result.length).toBe(1);
      expect(result[0].isTransportFailure).toBe(true);
      expect(result[0].failureText).toBe('net::ERR_ABORTED');
    });

    it('returns empty array when no traces match', () => {
      const filtered = filterNetworkTraces(CANONICAL_TC1_NETWORK_TRACES, 'POST');
      expect(filtered).toEqual([]);
    });
  });

  describe('Evidence Availability Status Mapping', () => {
    it('identifies PUBLIC_SAFE_READY as available and verified', () => {
      const availability = getEvidenceAvailability('PUBLIC_SAFE_READY');
      expect(availability.isAvailable).toBe(true);
      expect(availability.isQuarantined).toBe(false);
      expect(availability.isFailed).toBe(false);
      expect(availability.isPending).toBe(false);
    });

    it('identifies QUARANTINED_LEAK_DETECTED and provides explanation', () => {
      const availability = getEvidenceAvailability('QUARANTINED_LEAK_DETECTED');
      expect(availability.isAvailable).toBe(false);
      expect(availability.isQuarantined).toBe(true);
      expect(availability.explanation).toContain('RESTRICTED_RAW');
    });

    it('identifies STORAGE_SYNC_FAILED', () => {
      const availability = getEvidenceAvailability('STORAGE_SYNC_FAILED');
      expect(availability.isAvailable).toBe(false);
      expect(availability.isFailed).toBe(true);
    });

    it('identifies PENDING_GENERATION', () => {
      const availability = getEvidenceAvailability('PENDING_GENERATION');
      expect(availability.isAvailable).toBe(false);
      expect(availability.isPending).toBe(true);
    });
  });

  describe('Reproduction Package Export Builder', () => {
    it('constructs a complete self-contained package without secret credentials', () => {
      const investigation = SYNTHETIC_INVESTIGATIONS_CATALOG[8]; // Canonical TC1
      const pkg = buildReproductionPackage({
        investigation,
        plan: SYNTHETIC_PLAN_V1,
        manifest: SYNTHETIC_EVIDENCE_MANIFEST_TC1,
      });

      expect(pkg.traceCasePackageVersion).toBe('1.0.0');
      expect(pkg.investigation.id).toBe(investigation.id);
      expect(pkg.investigation.reproductionVerdict).toBe('CONFIRMED_REPRODUCED');
      expect(pkg.investigation.evidenceReadiness).toBe('PUBLIC_SAFE_READY');

      // Attempts comparison
      expect(pkg.attempts.attempt1?.defectDetected).toBe(true);
      expect(pkg.attempts.attempt2?.defectDetected).toBe(true);

      // Approved plan details
      expect(pkg.approvedPlan.version).toBe(1);
      expect(pkg.approvedPlan.steps?.length).toBe(3);
      expect(pkg.approvedPlan.planHash).toBe(SYNTHETIC_PLAN_V1.planHash);

      // Evidence manifest
      expect(pkg.evidenceManifest.triadComplete).toBe(true);
      expect(pkg.evidenceManifest.artifacts.length).toBe(3);

      // Security check: Must not contain raw secret tokens
      const serialized = JSON.stringify(pkg);
      expect(serialized).not.toContain('fixtureResetAuthSecret');
      expect(serialized).not.toContain('supersecret');
      expect(serialized).toContain('TC-INV-009');
    });

    it('handles investigation with null plan and manifest gracefully', () => {
      const initialDraft = SYNTHETIC_INVESTIGATIONS_CATALOG[0];
      const pkg = buildReproductionPackage({
        investigation: initialDraft,
        plan: null,
        manifest: null,
      });

      expect(pkg.investigation.id).toBe(initialDraft.id);
      expect(pkg.approvedPlan.version).toBeNull();
      expect(pkg.evidenceManifest.artifacts).toEqual([]);
      expect(pkg.evidenceManifest.triadComplete).toBe(false);
    });

    it('blocks publicUrl and flags security notice on quarantined investigations (TC-INV-009)', () => {
      // Find TC4 fixture or construct quarantined snapshot
      const quarantinedInv = SYNTHETIC_INVESTIGATIONS_CATALOG.find(
        (inv) => inv.evidenceReadiness === 'QUARANTINED_LEAK_DETECTED'
      ) || {
        ...SYNTHETIC_INVESTIGATIONS_CATALOG[8],
        evidenceReadiness: 'QUARANTINED_LEAK_DETECTED' as const,
      };

      const manifestWithRestrictedArtifact = {
        ...SYNTHETIC_EVIDENCE_MANIFEST_TC1,
        readinessStatus: 'QUARANTINED_LEAK_DETECTED' as const,
        artifacts: [
          {
            ...SYNTHETIC_EVIDENCE_MANIFEST_TC1.artifacts[0],
            storageTier: 'RESTRICTED_RAW' as const,
            publicUrl: 'http://internal-minio:9000/restricted/video.webm',
          },
        ],
      };

      const pkg = buildReproductionPackage({
        investigation: quarantinedInv,
        plan: SYNTHETIC_PLAN_V1,
        manifest: manifestWithRestrictedArtifact,
      });

      expect(pkg.securityNotice).toContain('SECURITY NOTICE: Evidence is quarantined');
      expect(pkg.evidenceManifest.triadComplete).toBe(false);
      // Crucial: publicUrl MUST be scrubbed to null to prevent client download
      expect(pkg.evidenceManifest.artifacts[0].publicUrl).toBeNull();
    });
  });

  describe('URL Query Parameter Sanitization (P3-07)', () => {
    it('redacts sensitive query parameters like token, apiKey, and secret', () => {
      const url = 'http://localhost:3005/api/tasks?token=secret123&apiKey=key456&status=active';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toContain('token=%5BREDACTED%5D');
      expect(sanitized).toContain('apiKey=%5BREDACTED%5D');
      expect(sanitized).toContain('status=active');
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).not.toContain('key456');
    });

    it('preserves non-sensitive query parameters unchanged', () => {
      const url = 'http://localhost:3005/tasks?view=grid&sort=desc&page=2';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('handles relative paths and malformed strings without throwing', () => {
      expect(sanitizeUrl('/tasks/view')).toBe('/tasks/view');
      expect(sanitizeUrl('not-a-valid-url')).toBe('not-a-valid-url');
    });
  });
});
