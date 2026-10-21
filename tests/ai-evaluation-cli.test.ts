import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * ============================================================================
 * TRACECASE PERSON 2: CLI SUBPROCESS & INTEGRATION SIMULATION TESTS (P2-08)
 * ============================================================================
 * 
 * Verifies that the evaluation CLI (evaluation/run-eval.ts):
 * - Enforces strict argument parsing (rejects unknown options with code 1)
 * - Safely executes single-role examples (Planner, Actor, Reviewer)
 * - Strictly rejects malformed or unverified receipts without network fetching
 * - Enforces nonzero exits on incomplete or blocked campaigns
 * - Never launches browser execution
 */

const RUN_EVAL_PATH = path.resolve(__dirname, '../evaluation/run-eval.ts');
const TSX_CLI_PATH = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');

function runCli(
  args: string[],
  customEnv?: Record<string, string | undefined>
): { status: number | null; stdout: string; stderr: string } {
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env };
  if (customEnv) {
    for (const [k, v] of Object.entries(customEnv)) {
      if (v === undefined) {
        delete mergedEnv[k];
      } else {
        mergedEnv[k] = v;
      }
    }
  }

  const result = spawnSync(
    process.execPath,
    [TSX_CLI_PATH, RUN_EVAL_PATH, ...args],
    {
      encoding: 'utf-8',
      shell: false,
      timeout: 60000,
      env: mergedEnv,
    }
  );

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('Evaluation CLI Runner Subprocess Tests', { timeout: 90000 }, () => {
  describe('Strict Argument Validation', () => {
    it('prints usage and exits 0 on --help', () => {
      const res = runCli(['--help']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('TRACECASE EVALUATION & ROLE CLI RUNNER');
      expect(res.stdout).toContain('Planner Example');
      expect(res.stdout).toContain('Action-Proposal Example');
      expect(res.stdout).toContain('Reviewer Example');
      expect(res.stdout).toContain('Mock Campaign');
    });

    it('rejects unrecognized arguments with exit code 1', () => {
      const res = runCli(['--unknown-flag']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Unrecognized argument '--unknown-flag'");
    });

    it('rejects missing argument values with exit code 1', () => {
      const res = runCli(['--provider']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('Missing value for --provider');
    });

    it('rejects unsupported provider with exit code 1', () => {
      const res = runCli(['--provider', 'claude_anthropic']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Unsupported --provider 'claude_anthropic'");
    });

    it('rejects unsupported mode with exit code 1', () => {
      const res = runCli(['--mode', 'live_cloud']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Unsupported --mode 'live_cloud'");
    });

    it('rejects nonexistent receipts file with exit code 1', () => {
      const res = runCli(['--receipts', 'path/to/nonexistent-receipts.json']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('Receipts file not found at path');
    });

    it('rejects --provider openai when explicit model identifier is missing with exit code 1', () => {
      const res = runCli(['--provider', 'openai'], {
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL_ID: undefined,
        OPENAI_MODEL_IDENTIFIER: undefined,
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('Explicit model identifier required when --provider openai is selected');
    });

    it('rejects --provider openai when OPENAI_API_KEY is missing with exit code 1', () => {
      const res = runCli(['--provider', 'openai', '--model', 'gpt-4o-2024-08-06'], {
        OPENAI_API_KEY: undefined,
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('Missing OPENAI_API_KEY environment variable');
    });
  });

  describe('Single-Role Supported Examples', () => {
    it('executes Planner example cleanly with exit code 0', () => {
      const res = runCli(['--example', 'planner', '--provider', 'mock']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('TRACECASE AI ROLE DEMONSTRATION: PLANNER / CLARIFIER (ROLE 1)');
      expect(res.stdout).toContain('[PLANNER RESULT] Variant: PLAN_PROPOSED');
      expect(res.stdout).toContain('SUCCESS: Planner example executed cleanly.');
    });

    it('executes Action Proposer example cleanly with exit code 0', () => {
      const res = runCli(['--example', 'actor', '--provider', 'mock']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('TRACECASE AI ROLE DEMONSTRATION: ACTION PROPOSER (ROLE 2)');
      expect(res.stdout).toContain('[ACTOR RESULT] Variant: PROPOSE_ACTION');
      expect(res.stdout).toContain('SUCCESS: Action-proposal example executed cleanly.');
    });

    it('executes Evidence Reviewer example cleanly with exit code 0', () => {
      const res = runCli(['--example', 'reviewer', '--provider', 'mock']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('TRACECASE AI ROLE DEMONSTRATION: EVIDENCE REVIEWER (ROLE 3)');
      expect(res.stdout).toContain('[REVIEWER RESULT] Variant: REPORT_SYNTHESIZED');
      expect(res.stdout).toContain('SUCCESS: Reviewer example executed cleanly.');
    });
  });

  describe('Mock Campaign Execution & Incomplete Acceptance Safeguard', () => {
    it('executes mock campaign and exits 1 because incomplete acceptance is rejected', () => {
      const res = runCli(['--mock']);
      // Nonzero exit code is strictly required when acceptance is incomplete or blocked
      expect(res.status).toBe(1);
      expect(res.stdout).toContain('[SYNTHETIC ROLE TEST - MOCK TEST DOUBLE]');
      expect(res.stdout).toContain('EVALUATION CAMPAIGN METRICS SUMMARY (10 DIMENSIONS)');
      expect(res.stdout).toContain('Passed Cases           : 11');
      expect(res.stdout).toContain('Blocked Cases          : 1');
      expect(res.stdout).toContain('False Confirmations    : 0');
      expect(res.stderr).toContain('CAMPAIGN INCOMPLETE: 1 cases were BLOCKED');
    });
  });

  describe('Authoritative Receipt Validation (Integrated Mode)', () => {
    const tempDir = path.resolve(__dirname, '../scratch');
    const validReceiptsFile = path.join(tempDir, 'test-valid-receipts.json');
    const malformedReceiptsFile = path.join(tempDir, 'test-malformed-receipts.json');

    beforeAll(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Valid 2-run confirmation receipt for TC1
      const validReceiptPayload = {
        'TC-TC1-ARRAY-OFFSET': {
          investigationId: '11111111-2222-3333-4444-555555555555',
          workerId: 'worker-node-1',
          leaseId: 'lease-789',
          planHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          approvedPlanId: 'approved-plan-uuid-001',
          targetBuildVersion: 'v1.0.0-buggy',
          fixtureScope: 'two_tasks_one_completed',
          authoritativeReproductionVerdict: 'CONFIRMED_REPRODUCED',
          authoritativeLifecycleState: 'COMPLETED',
          resetReceipt: {
            receiptId: 'reset-rec-001',
            httpStatus: 200,
            baselineRestored: true,
            fixtureScope: 'two_tasks_one_completed',
            timestampUtc: '2026-10-20T12:05:00.000Z',
          },
          attempt1: {
            attemptId: 'att-001',
            attemptIndex: 1,
            startedAtUtc: '2026-10-20T12:00:00.000Z',
            completedAtUtc: '2026-10-20T12:04:00.000Z',
            status: 'FAILED_ASSERTIONS',
            failureSignatureMatched: true,
            isValid: true,
            executionDurationMs: 3200,
            readbackBaselineVerified: true,
            assertionsEvaluated: [
              {
                predicateId: 'assert_task_b_deleted',
                predicateDescription: 'Task B should be deleted',
                passed: false,
                actualValue: 'PRESENT',
                expectedValue: 'NOT_PRESENT',
              },
            ],
            artifactManifest: {
              videoArtifactId: 'art-vid-1',
              videoVerifiedUrl: 'http://localhost:3005/artifacts/run1_video.webm',
              consoleLogArtifactId: 'art-con-1',
              consoleLogVerifiedUrl: 'http://localhost:3005/artifacts/run1_console.log',
              networkLogArtifactId: 'art-net-1',
              networkLogVerifiedUrl: 'http://localhost:3005/artifacts/run1_network.json',
              restrictedArtifactTypes: [],
              unverifiedOrMissing: [],
            },
            sanitizedConsoleExcerpts: ['[INFO] Run 1 clean'],
          },
          attempt2: {
            attemptId: 'att-002',
            attemptIndex: 2,
            startedAtUtc: '2026-10-20T12:06:00.000Z',
            completedAtUtc: '2026-10-20T12:10:00.000Z',
            status: 'FAILED_ASSERTIONS',
            failureSignatureMatched: true,
            isValid: true,
            executionDurationMs: 3100,
            readbackBaselineVerified: true,
            assertionsEvaluated: [
              {
                predicateId: 'assert_task_b_deleted',
                predicateDescription: 'Task B should be deleted',
                passed: false,
                actualValue: 'PRESENT',
                expectedValue: 'NOT_PRESENT',
              },
            ],
            artifactManifest: {
              videoArtifactId: 'art-vid-2',
              videoVerifiedUrl: 'http://localhost:3005/artifacts/run2_video.webm',
              consoleLogArtifactId: 'art-con-2',
              consoleLogVerifiedUrl: 'http://localhost:3005/artifacts/run2_console.log',
              networkLogArtifactId: 'art-net-2',
              networkLogVerifiedUrl: 'http://localhost:3005/artifacts/run2_network.json',
              restrictedArtifactTypes: [],
              unverifiedOrMissing: [],
            },
            sanitizedConsoleExcerpts: ['[INFO] Run 2 clean'],
          },
        },
      };

      fs.writeFileSync(validReceiptsFile, JSON.stringify(validReceiptPayload, null, 2));

      // Malformed receipt missing required fields
      fs.writeFileSync(
        malformedReceiptsFile,
        JSON.stringify({
          'TC-TC1-ARRAY-OFFSET': {
            investigationId: 'invalid-non-uuid',
            authoritativeReproductionVerdict: 'CONFIRMED_REPRODUCED',
          },
        })
      );
    });

    afterAll(() => {
      if (fs.existsSync(validReceiptsFile)) fs.unlinkSync(validReceiptsFile);
      if (fs.existsSync(malformedReceiptsFile)) fs.unlinkSync(malformedReceiptsFile);
    });

    it('rejects malformed receipts file at runtime schema validation with exit code 1', () => {
      const res = runCli(['--receipts', malformedReceiptsFile, '--mode', 'integrated']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('failed runtime schema validation');
      expect(res.stderr).toContain('Arbitrary or malformed receipt objects are strictly rejected.');
    });

    it('validates receipt file syntax and loads cleanly in integrated mode', () => {
      const res = runCli(['--receipts', validReceiptsFile, '--mode', 'integrated', '--mock']);
      expect(res.stdout).toContain('[RECEIPTS] Successfully validated 1 receipt entries. Zero network URLs fetched.');
      expect(res.stdout).toContain('[INTEGRATED ACCEPTANCE - AUTHORITATIVE RECEIPT-ONLY]');
    }, 30000);
  });
});
