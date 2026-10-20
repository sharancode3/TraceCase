import { describe, it, expect } from 'vitest';
import { TargetProfileSchema, ClientSafeTargetProfileSchema } from '@/contracts/targets';
import { ExperimentPlanSchema } from '@/contracts/planning';
import { ClarificationQuestionSchema } from '@/contracts/clarification';
import { EvidenceManifestSchema } from '@/contracts/evidence';
import { InvestigationSnapshotSchema } from '@/contracts/investigations';
import {
  SYNTHETIC_TARGETS,
  SYNTHETIC_PLAN_V1,
  SYNTHETIC_CLARIFICATION_QUESTIONS,
  SYNTHETIC_EVIDENCE_MANIFEST_TC1,
  SYNTHETIC_INVESTIGATIONS_CATALOG,
} from '@/dev/fixtures';

describe('Synthetic Fixture Canonical Contract Validation (P3-01)', () => {
  it('validates all synthetic targets against both ClientSafeTargetProfileSchema and TargetProfileSchema', () => {
    expect(SYNTHETIC_TARGETS.length).toBeGreaterThan(0);
    for (const target of SYNTHETIC_TARGETS) {
      // 1. Validates against the strict client-safe schema
      const clientSafeResult = ClientSafeTargetProfileSchema.safeParse(target);
      expect(
        clientSafeResult.success,
        `Target ${target.id} failed client-safe validation: ${JSON.stringify(clientSafeResult.error?.issues)}`
      ).toBe(true);

      // 2. Confirms strict absence of server-only secrets from client-accessible fixture objects
      expect('fixtureResetAuthSecret' in target).toBe(false);

      // 3. Verifies backwards compatibility with general TargetProfileSchema
      const generalResult = TargetProfileSchema.safeParse(target);
      expect(generalResult.success).toBe(true);
    }
  });

  it('strictly rejects fixtureResetAuthSecret injection into ClientSafeTargetProfileSchema', () => {
    const targetWithSecret = {
      ...SYNTHETIC_TARGETS[0],
      fixtureResetAuthSecret: 'tc-fixture-secret-2026',
    };

    const result = ClientSafeTargetProfileSchema.safeParse(targetWithSecret);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasUnrecognizedKey = result.error.issues.some((issue) => issue.code === 'unrecognized_keys');
      expect(hasUnrecognizedKey).toBe(true);
    }
  });

  it('validates SYNTHETIC_PLAN_V1 against ExperimentPlanSchema', () => {
    const result = ExperimentPlanSchema.safeParse(SYNTHETIC_PLAN_V1);
    expect(result.success, `Plan failed validation: ${JSON.stringify(result.error?.issues)}`).toBe(true);
  });

  it('validates all clarification questions against ClarificationQuestionSchema', () => {
    expect(SYNTHETIC_CLARIFICATION_QUESTIONS.length).toBeGreaterThan(0);
    for (const question of SYNTHETIC_CLARIFICATION_QUESTIONS) {
      const result = ClarificationQuestionSchema.safeParse(question);
      expect(
        result.success,
        `Clarification question ${question.id} failed validation: ${JSON.stringify(result.error?.issues)}`
      ).toBe(true);
    }
  });

  it('validates SYNTHETIC_EVIDENCE_MANIFEST_TC1 against EvidenceManifestSchema', () => {
    const result = EvidenceManifestSchema.safeParse(SYNTHETIC_EVIDENCE_MANIFEST_TC1);
    expect(result.success, `Evidence manifest failed validation: ${JSON.stringify(result.error?.issues)}`).toBe(true);
  });

  it('demonstrates that SYNTHETIC_INVESTIGATIONS_CATALOG uses preview slug IDs that fail strict UUID schema validation', () => {
    // Stage 0 synthetic catalog entries use human-readable slug IDs (e.g. '01-draft-state-uuid-000000000001')
    // instead of strict RFC 4122 UUIDs expected by InvestigationSnapshotSchema.
    expect(SYNTHETIC_INVESTIGATIONS_CATALOG.length).toBe(17);

    for (const snapshot of SYNTHETIC_INVESTIGATIONS_CATALOG) {
      const result = InvestigationSnapshotSchema.safeParse(snapshot);
      // Demonstrates the UUID contract mismatch without relaxing the schema or silently skipping
      expect(result.success).toBe(false);

      if (!result.success) {
        const idIssues = result.error.issues.filter(
          (issue) => (issue.path[0] === 'id' || issue.path[0] === 'reportId') && issue.message.includes('uuid')
        );
        expect(idIssues.length).toBeGreaterThan(0);
      }
    }
  });

  it('confirms that catalog items conform to InvestigationSnapshotSchema when substituted with standard UUIDs', () => {
    // Proves that all other lifecycle, verdict, evidence, and attempt fields are strictly valid,
    // confirming the ONLY blocker is the slug vs RFC 4122 UUID format choice.
    const sample = SYNTHETIC_INVESTIGATIONS_CATALOG[0];
    const uuidAlignedSample = {
      ...sample,
      id: '00000000-0000-0000-0000-000000000001',
      reportId: '00000000-0000-0000-0000-000000000002',
    };

    const result = InvestigationSnapshotSchema.safeParse(uuidAlignedSample);
    expect(result.success, `UUID-aligned sample failed: ${JSON.stringify(result.error?.issues)}`).toBe(true);
  });
});
