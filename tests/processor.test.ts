import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  processEvidenceTriad,
  MIN_VIDEO_BYTE_SIZE,
  type EvidenceTriadInput,
} from '@/server/evidence/processor';
import {
  InMemoryEvidenceStorageDriver,
  type EvidenceStorageDriver,
  type PutArtifactOptions,
  type StoredArtifactRecord,
} from '@/server/evidence/storage';
import { EvidenceManifestSchema, type StorageTier } from '@/contracts/evidence';

describe('Evidence Triad Processor and Manifest Builder (P3-03 / Slice 2)', () => {
  let driver: InMemoryEvidenceStorageDriver;
  const validInvestigationId = randomUUID();
  const testPublicUrlBase = 'https://cdn.tracecase.test/public-safe';

  // Helper to generate a valid dummy WebM buffer of given byte size
  const createVideoBuffer = (sizeBytes: number = MIN_VIDEO_BYTE_SIZE + 1024): Buffer => {
    const buf = Buffer.alloc(sizeBytes, 0x5a); // 0x5a = 'Z'
    return buf;
  };

  // Helper for sample clean console log
  const sampleCleanConsole = `[2026-10-20T12:00:00.000Z] [INFO] [App] Target navigation initialized
[2026-10-20T12:00:01.000Z] [LOG] [App] React root component hydrated
[2026-10-20T12:00:02.000Z] [WARN] [App] Deprecated layout API invoked
[2026-10-20T12:00:03.000Z] [INFO] [App] Investigation assertion executed`;

  // Helper for sample clean network trace (JSON format)
  const sampleCleanNetworkHar = JSON.stringify({
    version: '1.2',
    creator: { name: 'TraceCase-CDP', version: '1.0.0' },
    entries: [
      {
        startedDateTime: '2026-10-20T12:00:00.500Z',
        time: 42,
        request: {
          method: 'GET',
          url: 'https://staging.target.app/api/v1/items',
          headers: [{ name: 'Accept', value: 'application/json' }],
        },
        response: {
          status: 200,
          statusText: 'OK',
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          content: { mimeType: 'application/json', text: '{"items":[]}' },
        },
      },
    ],
  });

  beforeEach(() => {
    driver = new InMemoryEvidenceStorageDriver();
  });

  describe('Full Clean Evidence Triad (Happy Path)', () => {
    it('successfully processes complete clean triad and issues PUBLIC_SAFE_READY manifest', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        attemptNumber: 1,
        videoBuffer: createVideoBuffer(15 * 1024),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        publicUrlBase: testPublicUrlBase,
      });

      // Strict schema compliance
      const parsed = EvidenceManifestSchema.safeParse(result.manifest);
      expect(parsed.success).toBe(true);

      const { manifest } = result;
      expect(manifest.investigationId).toBe(validInvestigationId);
      expect(manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');
      expect(manifest.triadComplete).toBe(true);
      expect(manifest.hasVideo).toBe(true);
      expect(manifest.hasConsoleLog).toBe(true);
      expect(manifest.hasNetworkTrace).toBe(true);
      expect(manifest.secretScrubbingVerified).toBe(true);
      expect(manifest.quarantineReasons).toBeUndefined();
      expect(result.quarantineApplied).toBe(false);
      expect(result.errors).toEqual([]);

      // Verify artifact inventory:
      // 1 video (RESTRICTED_RAW) + 2 console (RAW + SAFE) + 2 network (RAW + SAFE) = 5 artifacts
      expect(manifest.artifacts).toHaveLength(5);

      const rawArtifacts = manifest.artifacts.filter((a) => a.storageTier === 'RESTRICTED_RAW');
      const safeArtifacts = manifest.artifacts.filter((a) => a.storageTier === 'PUBLIC_SAFE');

      expect(rawArtifacts).toHaveLength(3); // Raw video + raw console + raw network
      expect(safeArtifacts).toHaveLength(2); // Safe console + safe network

      // RESTRICTED_RAW artifacts must strictly have publicUrl === null (Priority 1 & 2)
      for (const raw of rawArtifacts) {
        expect(raw.publicUrl).toBeNull();
      }

      // Video recording must strictly be in RESTRICTED_RAW with publicUrl === null
      const videoArtifact = manifest.artifacts.find((a) => a.kind === 'VIDEO_RECORDING');
      expect(videoArtifact).toBeDefined();
      expect(videoArtifact?.storageTier).toBe('RESTRICTED_RAW');
      expect(videoArtifact?.publicUrl).toBeNull();

      // Fix A: In Slice 2, ALL artifacts must strictly have publicUrl === null until Slice 3 authenticated retrieval exists
      for (const artifact of manifest.artifacts) {
        expect(artifact.publicUrl).toBeNull();
      }

      // Verify SHA-256 checksum format
      for (const artifact of manifest.artifacts) {
        expect(artifact.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(artifact.sizeBytes).toBeGreaterThan(0);
      }

      // Verify items exist in driver memory
      expect(result.storedArtifacts).toHaveLength(5);
    });

    it('defaults attemptNumber to 1 when omitted and names artifacts attempt_1_*', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(12 * 1024),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });
      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');

      for (const artifact of result.manifest.artifacts) {
        expect(artifact.attemptNumber).toBe(1);
        expect(artifact.fileName).toMatch(/^attempt_1_/);
      }
    });

    it('correctly handles attemptNumber = 2 and tags artifacts attempt_2_*', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        attemptNumber: 2,
        videoBuffer: createVideoBuffer(12 * 1024),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });
      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');

      for (const artifact of result.manifest.artifacts) {
        expect(artifact.attemptNumber).toBe(2);
        expect(artifact.fileName).toMatch(/^attempt_2_/);
      }
    });
  });

  describe('Video Threshold and Validation (VES-EVD-002)', () => {
    it('quarantines undersized video (< 10 KB) in RESTRICTED_RAW with publicUrl: null and rejects triad', async () => {
      const undersizedBytes = 5 * 1024; // 5 KB (< 10 KB)
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(undersizedBytes),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.triadComplete).toBe(false);
      expect(result.manifest.hasVideo).toBe(false); // Flagged false because video is invalid
      expect(result.manifest.quarantineReasons).toBeDefined();
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('VIDEO_RECORDING_UNDERSIZED'))
      ).toBe(true);

      // Verify the undersized video is placed in RESTRICTED_RAW for debugging, never in PUBLIC_SAFE
      const videoArtifact = result.manifest.artifacts.find((a) => a.kind === 'VIDEO_RECORDING');
      expect(videoArtifact).toBeDefined();
      expect(videoArtifact?.storageTier).toBe('RESTRICTED_RAW');
      expect(videoArtifact?.publicUrl).toBeNull();
      expect(videoArtifact?.fileName).toContain('undersized_recording.webm');

      // No PUBLIC_SAFE video artifact exists
      const safeVideo = result.manifest.artifacts.find(
        (a) => a.kind === 'VIDEO_RECORDING' && a.storageTier === 'PUBLIC_SAFE'
      );
      expect(safeVideo).toBeUndefined();
    });

    it('enforces boundary condition: 10,239 bytes fails, 10,240 bytes passes', async () => {
      // 10,239 bytes (1 byte below 10 KB threshold)
      const subThreshold = await processEvidenceTriad(
        {
          investigationId: validInvestigationId,
          videoBuffer: createVideoBuffer(MIN_VIDEO_BYTE_SIZE - 1),
          consoleLog: sampleCleanConsole,
          networkHar: sampleCleanNetworkHar,
        },
        { storageDriver: driver }
      );
      expect(subThreshold.manifest.hasVideo).toBe(false);
      expect(subThreshold.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');

      // Reset driver for clean run
      const freshDriver = new InMemoryEvidenceStorageDriver();

      // 10,240 bytes (exact 10 KB threshold)
      const exactThreshold = await processEvidenceTriad(
        {
          investigationId: validInvestigationId,
          videoBuffer: createVideoBuffer(MIN_VIDEO_BYTE_SIZE),
          consoleLog: sampleCleanConsole,
          networkHar: sampleCleanNetworkHar,
        },
        { storageDriver: freshDriver }
      );
      expect(exactThreshold.manifest.hasVideo).toBe(true);
      expect(exactThreshold.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');

      const videoArt = exactThreshold.manifest.artifacts.find((a) => a.kind === 'VIDEO_RECORDING');
      expect(videoArt?.storageTier).toBe('RESTRICTED_RAW');
      expect(videoArt?.publicUrl).toBeNull();
    });

    it('Priority 1 Regression: valid-size video containing potential sensitive data is NOT promoted to PUBLIC_SAFE', async () => {
      // 20 KB valid video that could contain visible passwords or PII
      const videoBuffer = createVideoBuffer(20 * 1024);
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer,
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        publicUrlBase: testPublicUrlBase,
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.hasVideo).toBe(true);

      // Must be kept in RESTRICTED_RAW with publicUrl: null
      const videoArtifact = result.manifest.artifacts.find((a) => a.kind === 'VIDEO_RECORDING');
      expect(videoArtifact).toBeDefined();
      expect(videoArtifact?.storageTier).toBe('RESTRICTED_RAW');
      expect(videoArtifact?.publicUrl).toBeNull();

      // Zero video artifacts in PUBLIC_SAFE
      const publicSafeVideo = result.manifest.artifacts.find(
        (a) => a.kind === 'VIDEO_RECORDING' && a.storageTier === 'PUBLIC_SAFE'
      );
      expect(publicSafeVideo).toBeUndefined();

      // Verify the storage driver holds the artifact in RESTRICTED_RAW bucket
      const storedKey = result.storedArtifacts.find((a) => a.key.includes('raw_recording'))!.key;
      expect(await driver.hasArtifact(storedKey, 'RESTRICTED_RAW')).toBe(true);
      expect(await driver.hasArtifact(storedKey, 'PUBLIC_SAFE')).toBe(false);
    });

    it('handles missing video stream (null/undefined) truthfully', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: null,
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.hasVideo).toBe(false);
      expect(result.manifest.triadComplete).toBe(false);
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('VIDEO_RECORDING_MISSING'))
      ).toBe(true);
    });
  });

  describe('Console Log Omission and Sanitization (VES-EVD-003 & TC-INV-009)', () => {
    it('handles missing console log truthfully and quarantines triad', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: null,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.hasConsoleLog).toBe(false);
      expect(result.manifest.triadComplete).toBe(false);
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('CONSOLE_LOG_MISSING'))
      ).toBe(true);
    });

    it('redacts Bearer tokens, secrets, and auth headers from console log into PUBLIC_SAFE', async () => {
      const secretToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature';
      const rawConsoleWithSecrets = `[2026-10-20T12:00:00Z] [DEBUG] Authorization: Bearer ${secretToken}
[2026-10-20T12:00:01Z] [DEBUG] Connecting with api_key="sk_live_998877665544332211"
[2026-10-20T12:00:02Z] [INFO] User session authenticated`;

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: rawConsoleWithSecrets,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        publicUrlBase: testPublicUrlBase,
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');
      expect(result.manifest.secretScrubbingVerified).toBe(true);

      // Check the raw artifact in RESTRICTED_RAW: preserves the original
      const rawConsoleMeta = result.manifest.artifacts.find(
        (a) => a.kind === 'CONSOLE_LOG' && a.storageTier === 'RESTRICTED_RAW'
      );
      expect(rawConsoleMeta).toBeDefined();
      expect(rawConsoleMeta?.publicUrl).toBeNull();
      expect(rawConsoleMeta?.redactionApplied).toBe(false);

      const rawConsoleKey = result.storedArtifacts.find(
        (a) => a.tier === 'RESTRICTED_RAW' && a.key.includes('raw_console')
      )!.key;
      const rawConsoleRecord = await driver.getArtifact(rawConsoleKey, 'RESTRICTED_RAW');
      expect(rawConsoleRecord?.data.toString('utf8')).toContain(secretToken);

      // Check the sanitized artifact in PUBLIC_SAFE: secrets redacted!
      const safeConsoleMeta = result.manifest.artifacts.find(
        (a) => a.kind === 'CONSOLE_LOG' && a.storageTier === 'PUBLIC_SAFE'
      );
      expect(safeConsoleMeta).toBeDefined();
      expect(safeConsoleMeta?.publicUrl).toBeNull();
      expect(safeConsoleMeta?.redactionApplied).toBe(true);

      const safeConsoleKey = result.storedArtifacts.find(
        (a) => a.tier === 'PUBLIC_SAFE' && a.key.includes('console.log')
      )!.key;
      const safeConsoleRecord = await driver.getArtifact(safeConsoleKey, 'PUBLIC_SAFE');
      const safeText = safeConsoleRecord?.data.toString('utf8') ?? '';
      expect(safeText).not.toContain(secretToken);
      expect(safeText).not.toContain('sk_live_998877665544332211');
      expect(safeText).toContain('[REDACTED_BEARER_TOKEN]');
      expect(safeText).toContain('[REDACTED_SECRET]');
    });

    it('quarantines console log when byte limit is exceeded (truncation occurs)', async () => {
      // 200 bytes limit; pass 500 bytes of log
      const largeLog = 'Log line with padding data to exceed tiny byte threshold.\n'.repeat(10);
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: largeLog,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        maxLogSizeBytes: 100, // Small limit to force truncation
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.secretScrubbingVerified).toBe(false);
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('CONSOLE_LOG_TRUNCATED'))
      ).toBe(true);

      // Truncated derivative must NOT be in PUBLIC_SAFE
      const publicConsole = result.manifest.artifacts.find(
        (a) => a.kind === 'CONSOLE_LOG' && a.storageTier === 'PUBLIC_SAFE'
      );
      expect(publicConsole).toBeUndefined();

      // Must be kept in RESTRICTED_RAW with publicUrl: null
      const quarantinedConsole = result.manifest.artifacts.find(
        (a) => a.kind === 'CONSOLE_LOG' && a.fileName.includes('quarantined_console.log')
      );
      expect(quarantinedConsole).toBeDefined();
      expect(quarantinedConsole?.storageTier).toBe('RESTRICTED_RAW');
      expect(quarantinedConsole?.publicUrl).toBeNull();
    });

    it('Priority 2: quarantines manifest and exposes NO artifact URLs when secret is detected in console evidence', async () => {
      // Force truncation to trigger incomplete scan and quarantine
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: 'Diagnostic log stream with secret credentials '.repeat(50),
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        maxLogSizeBytes: 50, // Force truncation
        publicUrlBase: testPublicUrlBase, // Even if base is provided, quarantine must suppress ALL URLs!
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.secretScrubbingVerified).toBe(false);

      // Priority 2 Assertion: Every single artifact in manifest MUST have publicUrl === null
      expect(result.manifest.artifacts.length).toBeGreaterThan(0);
      for (const artifact of result.manifest.artifacts) {
        expect(artifact.publicUrl).toBeNull();
      }
    });
  });

  describe('Network Trace Omission and Sanitization (VES-EVD-004 & TC-INV-009)', () => {
    it('handles missing network trace truthfully and quarantines triad', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: null,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.hasNetworkTrace).toBe(false);
      expect(result.manifest.triadComplete).toBe(false);
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('NETWORK_TRACE_MISSING'))
      ).toBe(true);
    });

    it('sanitizes structured JSON network trace headers and request bodies', async () => {
      const secretPassword = 'P@ssword123456!';
      const sensitiveNetworkData = {
        log: {
          entries: [
            {
              request: {
                method: 'POST',
                url: 'https://staging.target.app/api/auth/login',
                headers: [
                  { name: 'Authorization', value: 'Bearer my-sensitive-auth-jwt' },
                ],
                auth: {
                  token: 'secret-token-value',
                  password: secretPassword,
                },
              },
              response: {
                status: 200,
                cookie: 'session_id=secret_cookie_token; Secure',
              },
            },
          ],
        },
      };

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: JSON.stringify(sensitiveNetworkData),
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        publicUrlBase: testPublicUrlBase,
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');
      expect(result.manifest.secretScrubbingVerified).toBe(true);

      // Verify raw original in RESTRICTED_RAW preserves secrets
      const rawNetworkKey = result.storedArtifacts.find(
        (a) => a.tier === 'RESTRICTED_RAW' && a.key.includes('raw_network')
      )!.key;
      const rawRecord = await driver.getArtifact(rawNetworkKey, 'RESTRICTED_RAW');
      expect(rawRecord?.data.toString('utf8')).toContain(secretPassword);

      // Verify sanitized derivative in PUBLIC_SAFE redacts secrets
      const safeNetworkKey = result.storedArtifacts.find(
        (a) => a.tier === 'PUBLIC_SAFE' && a.key.includes('network.json')
      )!.key;
      const safeRecord = await driver.getArtifact(safeNetworkKey, 'PUBLIC_SAFE');
      const safeText = safeRecord?.data.toString('utf8') ?? '';
      expect(safeText).not.toContain(secretPassword);
      expect(safeText).not.toContain('my-sensitive-auth-jwt');
      expect(safeText).not.toContain('secret-token-value');
      expect(safeText).toContain('[REDACTED_');
    });

    it('gracefully sanitizes malformed non-JSON network trace via text fallback', async () => {
      const malformedNetwork = 'MALFORMED_CDP_RAW_DUMP Authorization: Bearer secret-raw-token-777\npassword="supersecret"';
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: malformedNetwork,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');

      const safeNetworkKey = result.storedArtifacts.find(
        (a) => a.tier === 'PUBLIC_SAFE' && a.key.includes('network.json')
      )!.key;
      const safeRecord = await driver.getArtifact(safeNetworkKey, 'PUBLIC_SAFE');
      const safeText = safeRecord?.data.toString('utf8') ?? '';
      expect(safeText).not.toContain('secret-raw-token-777');
      expect(safeText).not.toContain('supersecret');
      expect(safeText).toContain('[REDACTED_');
    });

    it('quarantines network trace when byte limit is exceeded', async () => {
      const largeNetwork = JSON.stringify({ data: 'A'.repeat(500) });
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: largeNetwork,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        maxNetworkSizeBytes: 50, // Small limit to force truncation
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.secretScrubbingVerified).toBe(false);
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('NETWORK_TRACE_TRUNCATED'))
      ).toBe(true);

      // Safe bucket must not have the truncated network trace
      const safeNetwork = result.manifest.artifacts.find(
        (a) => a.kind === 'NETWORK_TRACE' && a.storageTier === 'PUBLIC_SAFE'
      );
      expect(safeNetwork).toBeUndefined();

      // Quarantined derivative must exist in RESTRICTED_RAW with publicUrl: null
      const quarantinedNetwork = result.manifest.artifacts.find(
        (a) => a.kind === 'NETWORK_TRACE' && a.fileName.includes('quarantined_network.json')
      );
      expect(quarantinedNetwork).toBeDefined();
      expect(quarantinedNetwork?.storageTier).toBe('RESTRICTED_RAW');
      expect(quarantinedNetwork?.publicUrl).toBeNull();
    });

    it('quarantines network trace derivative in RESTRICTED_RAW when residual secret is detected', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: JSON.stringify({
          request: {
            url: 'https://staging.target.app/api/auth/login?apiKey=sk_live_raw_api_key_123',
          },
        }),
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('QUARANTINED_LEAK_DETECTED');
      expect(result.manifest.secretScrubbingVerified).toBe(false);
      expect(
        result.manifest.quarantineReasons?.some((r) => r.includes('NETWORK_TRACE_RESIDUAL_SECRET'))
      ).toBe(true);

      // Must be kept in RESTRICTED_RAW with publicUrl: null
      const quarantined = result.manifest.artifacts.find(
        (a) => a.kind === 'NETWORK_TRACE' && a.fileName.includes('quarantined_network.json')
      );
      expect(quarantined).toBeDefined();
      expect(quarantined?.storageTier).toBe('RESTRICTED_RAW');
      expect(quarantined?.publicUrl).toBeNull();

      // Priority 2: Quarantined manifest strictly suppresses all artifact URLs
      expect(result.manifest.artifacts.every((a) => a.publicUrl === null)).toBe(true);
    });
  });

  describe('Storage Error Handling and STORAGE_SYNC_FAILED', () => {
    it('sets readinessStatus to STORAGE_SYNC_FAILED when storage driver fails', async () => {
      // Create a faulty storage driver that throws on putArtifact
      const failingDriver: EvidenceStorageDriver = {
        putArtifact: async () => {
          throw new Error('S3 connection timed out (simulated network failure)');
        },
        getArtifact: async () => null,
        deleteArtifact: async () => false,
        hasArtifact: async () => false,
        listArtifacts: async () => [],
      };

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: failingDriver });

      // Valid manifest even upon storage failure
      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('STORAGE_SYNC_FAILED');
      expect(result.manifest.triadComplete).toBe(false);
      expect(result.manifest.secretScrubbingVerified).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('S3 connection timed out');
      expect(result.storedArtifacts).toHaveLength(0);
    });

    it('Fix B: handles partial storage failure gracefully, executes rollback, and clears records when all deletions succeed', async () => {
      let callCount = 0;
      const partialFailDriver: EvidenceStorageDriver = {
        putArtifact: async (params: PutArtifactOptions): Promise<StoredArtifactRecord> => {
          callCount++;
          if (callCount === 3) {
            // Fail on 3rd upload
            throw new Error('Simulated disk quota exceeded on 3rd artifact');
          }
          return driver.putArtifact(params);
        },
        getArtifact: driver.getArtifact.bind(driver),
        deleteArtifact: driver.deleteArtifact.bind(driver),
        hasArtifact: driver.hasArtifact.bind(driver),
        listArtifacts: driver.listArtifacts.bind(driver),
      };

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: partialFailDriver });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('STORAGE_SYNC_FAILED');
      expect(result.manifest.triadComplete).toBe(false);
      expect(result.manifest.secretScrubbingVerified).toBe(false);
      expect(result.errors.some((e) => e.includes('disk quota exceeded'))).toBe(true);

      // When all deletions succeed (driver returns true), records are cleared
      expect(result.storedArtifacts).toHaveLength(0);
      expect(result.manifest.artifacts).toHaveLength(0);

      // Verify driver memory was purged (no orphaned objects in storage)
      const expectedVideoKey = `investigations/${validInvestigationId}/attempts/1/attempt_1_raw_recording.webm`;
      expect(await driver.hasArtifact(expectedVideoKey, 'RESTRICTED_RAW')).toBe(false);
    });

    it('Fix B: truthfully retains orphaned artifacts with publicUrl: null when deleteArtifact returns false', async () => {
      let callCount = 0;
      const falseDeleteDriver: EvidenceStorageDriver = {
        putArtifact: async (params: PutArtifactOptions): Promise<StoredArtifactRecord> => {
          callCount++;
          if (callCount >= 3) {
            // Fail on 3rd upload and any subsequent uploads (simulating persistent outage)
            throw new Error('Simulated network timeout on 3rd upload');
          }
          return driver.putArtifact(params);
        },
        getArtifact: driver.getArtifact.bind(driver),
        deleteArtifact: async (_key: string, _tier: StorageTier): Promise<boolean> => {
          // Deletion fails / returns false (e.g. S3 delete returns 403 or object cannot be deleted)
          return false;
        },
        hasArtifact: driver.hasArtifact.bind(driver),
        listArtifacts: driver.listArtifacts.bind(driver),
      };

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: falseDeleteDriver,
        publicUrlBase: testPublicUrlBase,
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('STORAGE_SYNC_FAILED');
      expect(result.manifest.triadComplete).toBe(false);

      // Truthful retention: 2 artifacts were uploaded before failure, and neither could be deleted!
      expect(result.storedArtifacts).toHaveLength(2);
      expect(result.manifest.artifacts).toHaveLength(2);

      // Orphaned artifacts must strictly have publicUrl: null
      for (const artifact of result.manifest.artifacts) {
        expect(artifact.publicUrl).toBeNull();
      }

      // Diagnostic errors and quarantine reasons must clearly state the rollback cleanup failure
      expect(
        result.errors.some(
          (e) => e.includes('Rollback cleanup failed') && e.includes('remains orphaned in storage')
        )
      ).toBe(true);
      expect(
        result.manifest.quarantineReasons?.some(
          (r) => r.startsWith('STORAGE_CLEANUP_FAILED:') && r.includes('remained in')
        )
      ).toBe(true);
      expect(result.quarantineApplied).toBe(true);

      // Verify artifacts actually still exist in the driver
      const expectedVideoKey = `investigations/${validInvestigationId}/attempts/1/attempt_1_raw_recording.webm`;
      expect(await driver.hasArtifact(expectedVideoKey, 'RESTRICTED_RAW')).toBe(true);
    });

    it('Fix B: truthfully retains orphaned artifacts with publicUrl: null when deleteArtifact throws an exception', async () => {
      let callCount = 0;
      const throwDeleteDriver: EvidenceStorageDriver = {
        putArtifact: async (params: PutArtifactOptions): Promise<StoredArtifactRecord> => {
          callCount++;
          if (callCount >= 2) {
            // Fail on 2nd upload and any subsequent uploads (simulating persistent outage)
            throw new Error('Simulated disk full on 2nd upload');
          }
          return driver.putArtifact(params);
        },
        getArtifact: driver.getArtifact.bind(driver),
        deleteArtifact: async (key: string, tier: StorageTier): Promise<boolean> => {
          // Deletion throws an error (e.g. storage connection lost)
          throw new Error(`S3 connection reset while deleting "${key}" from "${tier}"`);
        },
        hasArtifact: driver.hasArtifact.bind(driver),
        listArtifacts: driver.listArtifacts.bind(driver),
      };

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: throwDeleteDriver,
        publicUrlBase: testPublicUrlBase,
      });

      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('STORAGE_SYNC_FAILED');

      // 1 artifact was uploaded before failure; delete threw so artifact remains recorded
      expect(result.storedArtifacts).toHaveLength(1);
      expect(result.manifest.artifacts).toHaveLength(1);
      expect(result.manifest.artifacts[0].publicUrl).toBeNull();

      // Exception logged in errors
      expect(
        result.errors.some(
          (e) => e.includes('Rollback cleanup exception') && e.includes('S3 connection reset')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          (e) => e.includes('Rollback cleanup failed') && e.includes('remains orphaned in storage')
        )
      ).toBe(true);
      expect(
        result.manifest.quarantineReasons?.some(
          (r) => r.startsWith('STORAGE_CLEANUP_FAILED:') && r.includes('remained in')
        )
      ).toBe(true);
    });

    it('Fix B: handles mixed rollback (partial deletion success/failure) truthfully without string-matching fragility', async () => {
      let putCount = 0;
      let deleteCount = 0;
      const mixedDriver: EvidenceStorageDriver = {
        putArtifact: async (params: PutArtifactOptions): Promise<StoredArtifactRecord> => {
          putCount++;
          if (putCount >= 3) {
            // Fail on 3rd upload and any subsequent uploads
            throw new Error('Simulated upload failure on 3rd item');
          }
          return driver.putArtifact(params);
        },
        getArtifact: driver.getArtifact.bind(driver),
        deleteArtifact: async (key: string, tier: StorageTier): Promise<boolean> => {
          deleteCount++;
          if (deleteCount === 1) {
            // First item deletion succeeds
            await driver.deleteArtifact(key, tier);
            return true;
          }
          // Second item deletion fails
          return false;
        },
        hasArtifact: driver.hasArtifact.bind(driver),
        listArtifacts: driver.listArtifacts.bind(driver),
      };

      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: mixedDriver });

      expect(result.manifest.readinessStatus).toBe('STORAGE_SYNC_FAILED');
      // Exactly 1 artifact remained (the one that failed deletion)
      expect(result.storedArtifacts).toHaveLength(1);
      expect(result.manifest.artifacts).toHaveLength(1);
      expect(result.manifest.artifacts[0].publicUrl).toBeNull();
      expect(result.errors.some((e) => e.includes('Rollback cleanup failed'))).toBe(true);
    });
  });

  describe('Input Validation and RFC 4122 UUID Guarantees', () => {
    it('rejects invalid investigationId and throws descriptive error', async () => {
      const invalidIds = ['not-a-uuid', '12345', '', '   ', 'uuid-with-invalid-chars!@#'];

      for (const invalidId of invalidIds) {
        await expect(
          processEvidenceTriad({
            investigationId: invalidId,
            videoBuffer: createVideoBuffer(),
            consoleLog: sampleCleanConsole,
            networkHar: sampleCleanNetworkHar,
          })
        ).rejects.toThrow(/RFC 4122 UUID/);
      }
    });

    it('defaults publicUrl to null when publicUrlBase is omitted (SEC-02 Remediation)', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, { storageDriver: driver });
      expect(EvidenceManifestSchema.safeParse(result.manifest).success).toBe(true);
      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');

      // SEC-02: Direct S3 endpoint URLs must not be returned. All artifacts strictly have publicUrl === null.
      for (const artifact of result.manifest.artifacts) {
        expect(artifact.publicUrl).toBeNull();
      }
    });

    it('Fix A: guarantees publicUrl is strictly null for all artifacts even when publicUrlBase is explicitly supplied', async () => {
      const input: EvidenceTriadInput = {
        investigationId: validInvestigationId,
        videoBuffer: createVideoBuffer(),
        consoleLog: sampleCleanConsole,
        networkHar: sampleCleanNetworkHar,
      };

      const result = await processEvidenceTriad(input, {
        storageDriver: driver,
        publicUrlBase: 'https://cdn.tracecase.test/public-safe',
      });

      expect(result.manifest.readinessStatus).toBe('PUBLIC_SAFE_READY');
      expect(result.manifest.artifacts.length).toBe(5);
      for (const artifact of result.manifest.artifacts) {
        expect(artifact.publicUrl).toBeNull();
      }
    });
  });
});
