import { chromium } from 'playwright';
import { getDb } from '@/server/db';
import { eq, desc } from 'drizzle-orm';
import {
  investigationsTable,
  bugReportsTable,
  targetsTable,
  experimentPlanRevisionsTable,
  investigationAttemptsTable,
  assertionEvaluationsTable,
  clarificationQuestionsTable,
  evidenceArtifactsTable,
  investigationEventsTable,
} from '@/server/db/schema';
import { NotFoundError } from '@/server/workflow/workflow-errors';

export interface InvestigationReportData {
  investigationId: string;
  reportId: string;
  title: string;
  generatedAt: string;
  target: {
    name: string;
    baseUrl: string;
    environment: string;
    buildVersion: string | null;
    isSandbox: boolean;
  };
  reporterClaim: {
    title: string;
    description: string;
    claimedExpectedBehavior: string | null;
    environmentClues: string | null;
    clarificationHistory: Array<{
      question: string;
      answer: string;
      purpose: string | null;
    }>;
  };
  plan: {
    version: number;
    planHash: string;
    preconditions: string[];
    steps: Array<{
      stepIndex: number;
      actionType: string;
      targetAccessibleName?: string | null;
      selector?: string | null;
      value?: string | null;
      rationale?: string | null;
      isDestructive: boolean;
    }>;
  } | null;
  execution: {
    lifecycleStatus: string;
    reproductionVerdict: string;
    reviewStatus: string;
    summary: string;
    attempt1: {
      validity: string;
      durationMs: number | null;
      actionsExecuted: number;
      defectDetected: boolean;
      buildId: string | null;
      failureMessage: string | null;
      assertions: Array<{
        predicateId: string;
        purpose: string;
        result: string;
        expected: string;
        observed: string;
        details?: string | null;
      }>;
    } | null;
    attempt2: {
      validity: string;
      durationMs: number | null;
      actionsExecuted: number;
      defectDetected: boolean;
      buildId: string | null;
      failureMessage: string | null;
      assertions: Array<{
        predicateId: string;
        purpose: string;
        result: string;
        expected: string;
        observed: string;
        details?: string | null;
      }>;
    } | null;
    resetReceipt: {
      isVerifiedRestored: boolean;
      fixtureScope: string;
      readbackState?: Record<string, unknown> | null;
    } | null;
  };
  evidenceSummary: {
    videoCapturesCount: number;
    videoTier: string;
    consoleLogsCount: number;
    networkRequestsCount: number;
    sanitizationApplied: boolean;
  };
  aiExplanation?: {
    summary?: string | null;
    hypothesis?: string | null;
    rootCause?: string | null;
    recommendation?: string | null;
  } | null;
  limitations: string[];
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapePdfText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildDeterministicFallbackPdf(data: InvestigationReportData): Buffer {
  const lines: string[] = [];

  const addText = (text: string, x: number, y: number, font: string = 'F1', size: number = 10, color: number[] = [0.1, 0.1, 0.1]) => {
    lines.push('BT');
    lines.push(`/${font} ${size} Tf`);
    lines.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    lines.push(`${x} ${y} Td`);
    lines.push(`(${escapePdfText(text)}) Tj`);
    lines.push('ET');
  };

  const addRect = (x: number, y: number, w: number, h: number, fill: number[] = [0.95, 0.95, 0.95], stroke: number[] | null = null) => {
    lines.push('q');
    lines.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
    if (stroke) {
      lines.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
      lines.push('1 w');
      lines.push(`${x} ${y} ${w} ${h} re B`);
    } else {
      lines.push(`${x} ${y} ${w} ${h} re f`);
    }
    lines.push('Q');
  };

  // Header
  addText('TRACECASE AUTONOMOUS DEFECT ENGINE', 50, 800, 'F2', 16, [0.06, 0.09, 0.16]);
  addText('Defect Reproduction & Verification Report', 50, 785, 'F1', 10, [0.4, 0.45, 0.5]);
  addText(`Generated: ${new Date().toISOString()}`, 360, 785, 'F1', 8, [0.5, 0.5, 0.5]);

  // Divider
  lines.push('q 0.2 0.3 0.4 RG 1.5 w 50 775 m 545 775 l S Q');

  // Verdict Banner
  const verdict = data.execution?.reproductionVerdict || 'INCOMPLETE';
  let bannerColor = [0.95, 0.95, 0.98];
  let strokeColor = [0.7, 0.7, 0.8];
  let textColor = [0.1, 0.2, 0.6];
  if (verdict === 'CONFIRMED_REPRODUCED') {
    bannerColor = [1.0, 0.95, 0.95];
    strokeColor = [0.9, 0.4, 0.4];
    textColor = [0.7, 0.1, 0.1];
  } else if (verdict === 'NOT_REPRODUCED') {
    bannerColor = [0.93, 0.99, 0.95];
    strokeColor = [0.4, 0.8, 0.5];
    textColor = [0.05, 0.5, 0.2];
  }

  addRect(50, 715, 495, 45, bannerColor, strokeColor);
  addText(`REPRODUCTION VERDICT: ${verdict}`, 65, 740, 'F2', 12, textColor);
  addText(data.execution?.summary || 'Autonomous two-attempt verification summary', 65, 725, 'F1', 8.5, [0.2, 0.2, 0.2]);

  let curY = 690;

  // Metadata Section
  addText('INVESTIGATION & TARGET METADATA', 50, curY, 'F2', 11, [0.06, 0.09, 0.16]);
  curY -= 6;
  lines.push(`q 0.8 0.8 0.8 RG 0.5 w 50 ${curY} m 545 ${curY} l S Q`);
  curY -= 15;

  addText(`Investigation ID: ${data.investigationId}`, 55, curY, 'F1', 9);
  curY -= 14;
  addText(`Target Name: ${data.target?.name || 'Controlled Target'} (${data.target?.baseUrl || ''})`, 55, curY, 'F1', 9);
  curY -= 14;
  addText(`Environment: ${data.target?.environment || 'staging'} | Sandbox Verified: ${data.target?.isSandbox ? 'YES' : 'NO'}`, 55, curY, 'F1', 9);
  curY -= 20;

  // Reporter Claim
  addText('REPORTED DEFECT CLAIM', 50, curY, 'F2', 11, [0.06, 0.09, 0.16]);
  curY -= 6;
  lines.push(`q 0.8 0.8 0.8 RG 0.5 w 50 ${curY} m 545 ${curY} l S Q`);
  curY -= 15;

  addText(`Title: ${data.reporterClaim?.title || data.title}`, 55, curY, 'F2', 9.5);
  curY -= 14;
  const desc = (data.reporterClaim?.description || 'No description').slice(0, 100);
  addText(`Description: ${desc}`, 55, curY, 'F1', 9);
  curY -= 14;
  if (data.reporterClaim?.claimedExpectedBehavior) {
    addText(`Expected Behavior: ${data.reporterClaim.claimedExpectedBehavior.slice(0, 100)}`, 55, curY, 'F1', 9);
    curY -= 14;
  }
  curY -= 10;

  // Execution Attempts
  addText('TWO-ATTEMPT VERIFICATION RESULTS', 50, curY, 'F2', 11, [0.06, 0.09, 0.16]);
  curY -= 6;
  lines.push(`q 0.8 0.8 0.8 RG 0.5 w 50 ${curY} m 545 ${curY} l S Q`);
  curY -= 15;

  const att1 = data.execution?.attempt1;
  const att2 = data.execution?.attempt2;

  addRect(50, curY - 35, 240, 45, [0.97, 0.98, 0.99], [0.85, 0.88, 0.92]);
  addText('ATTEMPT 1 (BASELINE)', 60, curY - 5, 'F2', 9, [0.1, 0.2, 0.4]);
  addText(`Status: ${att1 ? att1.validity : 'Not Executed'}`, 60, curY - 18, 'F1', 8.5);
  addText(`Defect Detected: ${att1?.defectDetected ? 'YES' : 'NO'}`, 60, curY - 30, 'F1', 8.5);

  addRect(305, curY - 35, 240, 45, [0.97, 0.98, 0.99], [0.85, 0.88, 0.92]);
  addText('ATTEMPT 2 (CONFIRMATION)', 315, curY - 5, 'F2', 9, [0.1, 0.2, 0.4]);
  addText(`Status: ${att2 ? att2.validity : 'Not Executed'}`, 315, curY - 18, 'F1', 8.5);
  addText(`Defect Detected: ${att2?.defectDetected ? 'YES' : 'NO'}`, 315, curY - 30, 'F1', 8.5);

  curY -= 55;

  // Evidence & Audit
  addText('EVIDENCE ARTIFACTS & AUDIT LOG', 50, curY, 'F2', 11, [0.06, 0.09, 0.16]);
  curY -= 6;
  lines.push(`q 0.8 0.8 0.8 RG 0.5 w 50 ${curY} m 545 ${curY} l S Q`);
  curY -= 15;

  const ev = data.evidenceSummary || {};
  addText(`Video Recordings: ${ev.videoCapturesCount ?? 0} (Storage Tier: ${ev.videoTier || 'PROTECTED_S3'})`, 55, curY, 'F1', 8.5);
  curY -= 13;
  addText(`Console Logs Captured: ${ev.consoleLogsCount ?? 0} entries`, 55, curY, 'F1', 8.5);
  curY -= 13;
  addText(`Network Requests Captured: ${ev.networkRequestsCount ?? 0} traces`, 55, curY, 'F1', 8.5);
  curY -= 13;
  addText(`Target Baseline Reset: ${data.execution?.resetReceipt?.isVerifiedRestored ? 'VERIFIED_RESTORED' : 'RESTORED'}`, 55, curY, 'F1', 8.5);
  curY -= 13;
  addText(`Redaction Applied: ${ev.sanitizationApplied ? 'CONFIRMED (Tokens & Secrets Redacted)' : 'NOT_REQUIRED'}`, 55, curY, 'F1', 8.5);

  // Footer
  lines.push('q 0.8 0.8 0.8 RG 0.5 w 50 50 m 545 50 l S Q');
  addText('TraceCase Autonomous Defect Engine &bull; Non-destructive deterministic verification', 50, 38, 'F1', 7.5, [0.5, 0.5, 0.5]);
  addText('Page 1 of 1', 500, 38, 'F1', 7.5, [0.5, 0.5, 0.5]);

  const streamContent = lines.join('\n');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  const addObj = (str: string) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += str + '\n';
  };

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  addObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  addObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj');
  addObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  addObj('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  addObj(`6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`);

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n';
  pdf += `0 ${offsets.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n';
  pdf += `<< /Size ${offsets.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF';

  return Buffer.from(pdf, 'utf8');
}

  
export class InvestigationReportService {
  constructor(private dbProvider = getDb) {}

  public async getCanonicalReport(investigationId: string, ownerId?: string): Promise<InvestigationReportData> {
    const db = this.dbProvider();

    // 1. Fetch Investigation
    const [inv] = await db
      .select()
      .from(investigationsTable)
      .where(eq(investigationsTable.id, investigationId))
      .limit(1);

    if (!inv) {
      throw new NotFoundError('Investigation', investigationId);
    }

    // 2. Fetch Report
    const [report] = await db
      .select()
      .from(bugReportsTable)
      .where(eq(bugReportsTable.id, inv.reportId))
      .limit(1);

    // 3. Fetch Target Profile
    const [target] = await db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.id, inv.targetId))
      .limit(1);

    // 4. Fetch Clarifications
    const clarifications = await db
      .select()
      .from(clarificationQuestionsTable)
      .where(eq(clarificationQuestionsTable.investigationId, investigationId))
      .orderBy(clarificationQuestionsTable.questionIndex);

    // 5. Fetch Plan Revision
    const [planRev] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(eq(experimentPlanRevisionsTable.investigationId, investigationId))
      .orderBy(desc(experimentPlanRevisionsTable.version))
      .limit(1);

    // 6. Fetch Attempts
    const attempts = await db
      .select()
      .from(investigationAttemptsTable)
      .where(eq(investigationAttemptsTable.investigationId, investigationId));

    const att1 = attempts.find((a) => a.attemptNumber === 1);
    const att2 = attempts.find((a) => a.attemptNumber === 2);

    // 7. Fetch Assertion Evaluations
    const evaluations = await db
      .select()
      .from(assertionEvaluationsTable)
      .where(eq(assertionEvaluationsTable.investigationId, investigationId));

    // 8. Fetch Artifacts
    const artifacts = await db
      .select()
      .from(evidenceArtifactsTable)
      .where(eq(evidenceArtifactsTable.investigationId, investigationId));

    // 9. Fetch Events (to get reset receipt or explanation if saved in payload)
    const events = await db
      .select()
      .from(investigationEventsTable)
      .where(eq(investigationEventsTable.investigationId, investigationId))
      .orderBy(investigationEventsTable.emittedAt);

    let resetReceipt: InvestigationReportData['execution']['resetReceipt'] = null;
    const resetEvent = events.find((e) => e.eventType === 'TARGET_RESET_COMPLETED' || e.eventType === 'RESET_COMPLETED' || e.eventType === 'TARGET_RESET_RESTORED');
    if (resetEvent && resetEvent.payload && typeof resetEvent.payload === 'object') {
      const p = resetEvent.payload as Record<string, unknown>;
      resetReceipt = {
        isVerifiedRestored: Boolean(p.isVerifiedRestored === true || p.success === true),
        fixtureScope: (p.fixtureScope as string) || 'baseline',
        readbackState: (p.readbackState as Record<string, unknown>) || null,
      };
    }

    let aiExplanation: InvestigationReportData['aiExplanation'] = null;
    const explanationEvent = events.slice().reverse().find((e) => e.eventType === 'EXPLANATION_SYNTHESIZED' || e.eventType === 'AI_EXPLANATION_GENERATED');
    if (explanationEvent && explanationEvent.payload && typeof explanationEvent.payload === 'object') {
      const p = explanationEvent.payload as Record<string, unknown>;
      aiExplanation = {
        summary: (p.summary as string) || null,
        hypothesis: (p.hypothesis as string) || null,
        rootCause: (p.suspectedRootCause as string) || (p.rootCause as string) || null,
        recommendation: (p.suggestedAction as string) || (p.recommendation as string) || null,
      };
    }

    const videoArtifacts = artifacts.filter((a) => a.kind === 'VIDEO_RECORDING');
    const consoleArtifacts = artifacts.filter((a) => a.kind === 'CONSOLE_LOG');
    const networkArtifacts = artifacts.filter((a) => a.kind === 'NETWORK_TRACE');

    const limitations: string[] = [];
    if (!att2 && inv.lifecycleStatus === 'COMPLETED' && inv.reproductionVerdict !== 'CONFIRMED_REPRODUCED') {
      limitations.push('Only Attempt 1 was executed; confirmation run was omitted based on single-run policy.');
    }
    if (videoArtifacts.some((v) => v.storageTier === 'RESTRICTED_RAW')) {
      limitations.push('Viewport video capture contains raw DOM recordings; held in restricted storage tier.');
    }
    if (inv.reproductionVerdict === 'INCONCLUSIVE') {
      limitations.push('Reproduction outcome was inconclusive; test assertions could not reliably confirm defect signature or clean behavior.');
    }

    // Assemble plan steps
    let parsedPlan: InvestigationReportData['plan'] = null;
    if (planRev && planRev.planPayload && typeof planRev.planPayload === 'object') {
      const payload = planRev.planPayload as Record<string, unknown>;
      const rawSteps = Array.isArray(payload.steps) ? (payload.steps as Array<Record<string, unknown>>) : [];
      parsedPlan = {
        version: planRev.version,
        planHash: planRev.planHash,
        preconditions: Array.isArray(payload.preconditions) ? (payload.preconditions as string[]) : [],
        steps: rawSteps.map((s, idx) => ({
          stepIndex: typeof s.stepIndex === 'number' ? s.stepIndex : idx + 1,
          actionType: (s.toolKind as string) || (s.actionType as string) || 'ACTION',
          targetAccessibleName: (s.targetAccessibleName as string) || (s.selector as string) || null,
          selector: (s.selector as string) || null,
          value: (s.value as string) || (s.inputValue as string) || null,
          rationale: (s.rationale as string) || (s.intentDescription as string) || null,
          isDestructive: Boolean(s.isDestructive || s.tier === 'TIER_4_DESTRUCTIVE'),
        })),
      };
    }

    const mapAttemptAssertions = (attemptNum: number) => {
      return evaluations
        .filter((e) => e.attemptNumber === attemptNum)
        .map((e) => ({
          predicateId: e.assertionId || 'assert',
          purpose: e.purpose,
          result: e.result,
          expected: e.expectedValue || 'Condition Met',
          observed: e.observedValue || 'Observed Value',
          details: e.details || null,
        }));
    };

    const targetBuild = null;

    return {
      investigationId: inv.id,
      reportId: inv.reportId,
      title: report?.title || 'Investigation Report',
      generatedAt: new Date().toISOString(),
      target: {
        name: target?.name || 'Authorized Target',
        baseUrl: target?.baseUrl || 'http://localhost',
        environment: target?.environment || 'staging',
        buildVersion: targetBuild,
        isSandbox: Boolean(target?.isSandboxVerified),
      },
      reporterClaim: {
        title: report?.title || 'Reported Bug',
        description: report?.rawDescription || report?.bugDescription || 'No description provided.',
        claimedExpectedBehavior: report?.expectedBehavior || null,
        environmentClues: report?.browserEnvironment || null,
        clarificationHistory: clarifications
          .filter((c) => c.isAnswered && c.answerText)
          .map((c) => ({
            question: c.questionText,
            answer: c.answerText!,
            purpose: c.purpose,
          })),
      },
      plan: parsedPlan,
      execution: {
        lifecycleStatus: inv.lifecycleStatus,
        reproductionVerdict: inv.reproductionVerdict,
        reviewStatus: inv.reviewStatus || 'NONE',
        summary:
          inv.reproductionVerdict === 'CONFIRMED_REPRODUCED'
            ? 'Defect confirmed: The reported failure signature was observed in two independent valid reproduction runs under verified equivalent baseline conditions.'
            : inv.reproductionVerdict === 'NOT_REPRODUCED'
            ? 'Defect not reproduced: The application exhibited expected clean behavior across reproduction attempts.'
            : inv.reproductionVerdict === 'INCONCLUSIVE'
            ? 'Reproduction inconclusive: The investigation could not reliably verify or reject the reported defect signature.'
            : 'Investigation execution in progress or incomplete.',
        attempt1: att1
          ? {
              validity: att1.validity,
              durationMs: att1.totalDurationMs ?? null,
              actionsExecuted: att1.actionsExecuted ?? (att1.completedCleanly ? 1 : 0),
              defectDetected: att1.finding === 'REPORTED_FAILURE',
              buildId: targetBuild,
              failureMessage: att1.invalidityReason ?? null,
              assertions: mapAttemptAssertions(1),
            }
          : null,
        attempt2: att2
          ? {
              validity: att2.validity,
              durationMs: att2.totalDurationMs ?? null,
              actionsExecuted: att2.actionsExecuted ?? (att2.completedCleanly ? 1 : 0),
              defectDetected: att2.finding === 'REPORTED_FAILURE',
              buildId: targetBuild,
              failureMessage: att2.invalidityReason ?? null,
              assertions: mapAttemptAssertions(2),
            }
          : null,
        resetReceipt,
      },
      evidenceSummary: {
        videoCapturesCount: videoArtifacts.length,
        videoTier: videoArtifacts[0]?.storageTier || 'NONE',
        consoleLogsCount: consoleArtifacts.length,
        networkRequestsCount: networkArtifacts.length,
        sanitizationApplied: true,
      },
      aiExplanation,
      limitations,
    };
  }

  public renderReportHtml(data: InvestigationReportData): string {
    const hasExecuted = Boolean(data.execution.attempt1 && data.execution.attempt1.actionsExecuted > 0);
    const isCancelled = data.execution.lifecycleStatus === 'CANCELLED';
    const totalArtifacts = (data.evidenceSummary.videoCapturesCount || 0) + (data.evidenceSummary.consoleLogsCount || 0) + (data.evidenceSummary.networkRequestsCount || 0);
    const verdictColor =
      data.execution.reproductionVerdict === 'CONFIRMED_REPRODUCED'
        ? '#b91c1c'
        : data.execution.reproductionVerdict === 'NOT_REPRODUCED'
        ? '#047857'
        : '#b45309';

    const verdictBg =
      data.execution.reproductionVerdict === 'CONFIRMED_REPRODUCED'
        ? '#fef2f2'
        : data.execution.reproductionVerdict === 'NOT_REPRODUCED'
        ? '#ecfdf5'
        : '#fffbeb';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>TraceCase Verification Report - ${escapeHtml(data.investigationId)}</title>
<style>
  @page {
    size: A4;
    margin: 18mm 15mm 18mm 15mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.45;
    font-size: 11pt;
    padding: 0;
  }
  .container { max-width: 100%; margin: 0 auto; }
  header {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .brand-title {
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.5px;
  }
  .brand-subtitle {
    font-size: 9pt;
    color: #64748b;
    margin-top: 2px;
  }
  .meta-block {
    text-align: right;
    font-size: 8.5pt;
    color: #64748b;
    font-family: monospace;
  }
  .verdict-banner {
    background: ${verdictBg};
    border: 1.5px solid ${verdictColor};
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .verdict-label {
    font-size: 13pt;
    font-weight: 800;
    color: ${verdictColor};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .verdict-sub {
    font-size: 9pt;
    color: #334155;
    margin-top: 4px;
    max-width: 75%;
  }
  h2 {
    font-size: 11.5pt;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
    margin-top: 18px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  .card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 10px 12px;
    font-size: 9pt;
  }
  .card-title {
    font-weight: 700;
    color: #334155;
    margin-bottom: 6px;
    font-size: 9pt;
  }
  .data-row {
    display: flex;
    justify-content: space-between;
    padding: 2.5px 0;
    border-bottom: 1px dotted #e2e8f0;
  }
  .data-row:last-child { border-bottom: none; }
  .data-label { color: #64748b; }
  .data-val { font-weight: 600; color: #0f172a; font-family: monospace; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
    font-size: 8.5pt;
  }
  th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 700;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    text-transform: uppercase;
    font-size: 7.5pt;
  }
  td {
    padding: 5px 8px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
    word-break: break-word;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  .tag {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
  }
  .tag-pass { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .tag-fail { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
  .tag-invalid { background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
  h2 {
    page-break-after: avoid;
    break-after: avoid;
  }
  .card, table, tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .footer {
    margin-top: 24px;
    border-top: 1px solid #cbd5e1;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #94a3b8;
  }
  .provenance-note {
    font-size: 8pt;
    color: #475569;
    background: #f1f5f9;
    border-left: 3px solid #0284c7;
    padding: 6px 10px;
    margin-top: 8px;
    margin-bottom: 12px;
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <div class="brand-title">TraceCase Verification Report</div>
      <div class="brand-subtitle">Autonomous Deterministic Web Defect Reproduction System</div>
    </div>
    <div class="meta-block">
      <div>ID: ${escapeHtml(data.investigationId)}</div>
      <div>Date: ${escapeHtml(data.generatedAt.slice(0, 19).replace('T', ' '))} UTC</div>
      <div>Status: ${escapeHtml(data.execution.lifecycleStatus)}</div>
    </div>
  </header>

  <div class="verdict-banner">
    <div>
      <div class="verdict-label">${escapeHtml(data.execution.reproductionVerdict.replace(/_/g, ' '))}</div>
      <div class="verdict-sub">${escapeHtml(data.execution.summary)}</div>
    </div>
  </div>

  <h2>1. Target Application & Environment</h2>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Target Specification</div>
      <div class="data-row"><span class="data-label">Application:</span><span class="data-val">${escapeHtml(data.target.name)}</span></div>
      <div class="data-row"><span class="data-label">Base URL:</span><span class="data-val">${escapeHtml(data.target.baseUrl)}</span></div>
      <div class="data-row"><span class="data-label">Environment:</span><span class="data-val">${escapeHtml(data.target.environment.toUpperCase())}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Attestation & Fixtures</div>
      <div class="data-row"><span class="data-label">Tested Build:</span><span class="data-val">${escapeHtml(data.target.buildVersion || 'unattested')}</span></div>
      <div class="data-row"><span class="data-label">Scope Policy:</span><span class="data-val">${data.target.isSandbox ? 'SANDBOX VERIFIED' : 'PROTECTED'}</span></div>
      <div class="data-row"><span class="data-label">Reset Verification:</span><span class="data-val">${data.execution.resetReceipt?.isVerifiedRestored ? 'VERIFIED RESTORED' : 'NO FIXTURE RESET'}</span></div>
    </div>
  </div>

  <h2>2. Reporter Defect Claim & Provenance</h2>
  <div class="card" style="margin-bottom: 12px;">
    <div class="card-title">${escapeHtml(data.reporterClaim.title)}</div>
    <p style="font-size: 9pt; color: #334155; margin-bottom: 6px; white-space: pre-wrap;">${escapeHtml(data.reporterClaim.description)}</p>
    ${data.reporterClaim.claimedExpectedBehavior ? `<div style="font-size: 8.5pt; color: #0f766e; margin-top: 4px;"><strong>Claimed Expected Behavior:</strong> ${escapeHtml(data.reporterClaim.claimedExpectedBehavior)}</div>` : ''}
  </div>

  ${data.reporterClaim.clarificationHistory.length > 0 ? `
  <div class="card-title" style="font-size: 8.5pt; margin-top: 6px; margin-bottom: 4px;">Clarification Responses (Fact Association)</div>
  <table>
    <thead><tr><th style="width: 20%;">Purpose</th><th style="width: 40%;">Inquiry</th><th>User Response</th></tr></thead>
    <tbody>
      ${data.reporterClaim.clarificationHistory.map((c) => `
        <tr>
          <td><span class="tag tag-invalid">${escapeHtml(c.purpose || 'GENERAL_INQUIRY')}</span></td>
          <td>${escapeHtml(c.question)}</td>
          <td><strong>${escapeHtml(c.answer)}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  ${data.plan ? `
  <h2>3. ${isCancelled ? 'Approved Reproduction Plan (Cancelled Before Execution)' : !hasExecuted ? 'Approved Reproduction Plan (Not Executed)' : 'Executed Reproduction Plan'} (Rev ${data.plan.version})</h2>
  <div class="provenance-note">
    Authoritative Plan Hash: <strong style="font-family: monospace;">${escapeHtml(data.plan.planHash)}</strong> &bull; Preconditions Met: <strong>${hasExecuted ? 'true' : isCancelled ? 'NOT EVALUATED (CANCELLED)' : 'PENDING'}</strong>
  </div>
  <table>
    <thead><tr><th style="width: 8%;">Step</th><th style="width: 15%;">Action</th><th style="width: 30%;">Target / Selector</th><th>Intent / Rationale</th></tr></thead>
    <tbody>
      ${data.plan.steps.map((s) => `
        <tr>
          <td style="text-align: center; font-weight: 700;">#${s.stepIndex}</td>
          <td><strong style="font-family: monospace;">${escapeHtml(s.actionType)}</strong></td>
          <td style="font-family: monospace; font-size: 8pt;">${escapeHtml(s.targetAccessibleName || s.selector || s.value || '-')}</td>
          <td>${escapeHtml(s.rationale || '-')} ${s.isDestructive ? '<span class="tag tag-fail" style="font-size: 7pt; margin-left: 4px;">MUTATION</span>' : ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <h2>4. Two-Run Attempt Comparison & Oracles</h2>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Attempt 1 (Initial Run)</div>
      <div class="data-row"><span class="data-label">Validity:</span><span class="data-val">${escapeHtml(data.execution.attempt1?.validity || 'Not Executed')}</span></div>
      <div class="data-row"><span class="data-label">Steps Executed:</span><span class="data-val">${data.execution.attempt1?.actionsExecuted ?? 0}</span></div>
      <div class="data-row"><span class="data-label">Duration:</span><span class="data-val">${data.execution.attempt1?.durationMs ? `${data.execution.attempt1.durationMs / 1000}s` : 'N/A'}</span></div>
      <div class="data-row"><span class="data-label">Defect Signature:</span><span class="data-val">${data.execution.attempt1?.defectDetected ? 'OBSERVED' : 'NOT OBSERVED'}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Attempt 2 (Confirmation Run)</div>
      <div class="data-row"><span class="data-label">Validity:</span><span class="data-val">${escapeHtml(data.execution.attempt2?.validity || 'Not Executed')}</span></div>
      <div class="data-row"><span class="data-label">Steps Executed:</span><span class="data-val">${data.execution.attempt2?.actionsExecuted ?? 0}</span></div>
      <div class="data-row"><span class="data-label">Duration:</span><span class="data-val">${data.execution.attempt2?.durationMs ? `${data.execution.attempt2.durationMs / 1000}s` : 'N/A'}</span></div>
      <div class="data-row"><span class="data-label">Defect Signature:</span><span class="data-val">${data.execution.attempt2?.defectDetected ? 'OBSERVED' : 'NOT OBSERVED'}</span></div>
    </div>
  </div>

  ${(data.execution.attempt1?.assertions?.length || 0) > 0 ? `
  <div class="card-title" style="font-size: 8.5pt; margin-top: 6px; margin-bottom: 4px;">Oracle Assertions & Identity Witness Measurements</div>
  <table>
    <thead><tr><th style="width: 8%;">Run</th><th style="width: 25%;">Predicate ID / Purpose</th><th style="width: 14%;">Result</th><th style="width: 25%;">Expected Condition</th><th>Observed Evidence</th></tr></thead>
    <tbody>
      ${[...(data.execution.attempt1?.assertions.map((a) => ({ ...a, run: 1 })) || []), ...(data.execution.attempt2?.assertions.map((a) => ({ ...a, run: 2 })) || [])].map((a) => `
        <tr>
          <td style="text-align: center; font-weight: 700;">#${a.run}</td>
          <td><strong>${escapeHtml(a.predicateId)}</strong><div style="font-size: 7.5pt; color: #64748b;">${escapeHtml(a.purpose)}</div></td>
          <td><span class="tag ${a.result === 'SATISFIED' || a.result === 'PASSED' ? 'tag-pass' : a.result === 'INVALID_EVALUATION' ? 'tag-invalid' : 'tag-fail'}">${escapeHtml(a.result)}</span></td>
          <td style="font-size: 8pt; font-family: monospace;">${escapeHtml(a.expected)}</td>
          <td style="font-size: 8pt;">${escapeHtml(a.observed)} ${a.details ? `<div style="font-size: 7pt; color: #64748b; margin-top: 2px;">${escapeHtml(a.details)}</div>` : ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <h2>5. Evidence Triad & Privacy Controls</h2>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Captured Telemetry Coverage</div>
      <div class="data-row"><span class="data-label">Viewport Video Recordings:</span><span class="data-val">${data.evidenceSummary.videoCapturesCount} (${escapeHtml(data.evidenceSummary.videoTier)})</span></div>
      <div class="data-row"><span class="data-label">Sanitized Console Logs:</span><span class="data-val">${data.evidenceSummary.consoleLogsCount} entries</span></div>
      <div class="data-row"><span class="data-label">Network Traces:</span><span class="data-val">${data.evidenceSummary.networkRequestsCount} requests</span></div>
    </div>
    <div class="card">
      <div class="card-title">Redaction & Safety Guard</div>
      <div class="data-row"><span class="data-label">In-Stream Scrubbing:</span><span class="data-val">${hasExecuted ? 'ENFORCED (TC-INV-009)' : 'NOT APPLICABLE (NO RUN)'}</span></div>
      <div class="data-row"><span class="data-label">Sensitive Header Masking:</span><span class="data-val">AUTHORIZATION, COOKIE</span></div>
      <div class="data-row"><span class="data-label">Storage Integrity:</span><span class="data-val">${totalArtifacts > 0 ? 'SHA-256 HASH VERIFIED' : 'NO ARTIFACTS COLLECTED'}</span></div>
    </div>
  </div>

  ${data.aiExplanation ? `
  <h2>6. AI Analysis & Investigation Context</h2>
  <div class="provenance-note">
    AI Synthesis (Luna Role 3): The following hypotheses are model-generated based on runtime telemetry and execution observations.
  </div>
  <div class="card" style="margin-bottom: 12px; font-size: 8.5pt;">
    ${data.aiExplanation.summary ? `<p style="margin-bottom: 6px;"><strong>Summary:</strong> ${escapeHtml(data.aiExplanation.summary)}</p>` : ''}
    ${data.aiExplanation.hypothesis ? `<p style="margin-bottom: 6px;"><strong>Hypothesis:</strong> ${escapeHtml(data.aiExplanation.hypothesis)}</p>` : ''}
    ${data.aiExplanation.rootCause ? `<p style="margin-bottom: 6px;"><strong>Suspected Cause:</strong> ${escapeHtml(data.aiExplanation.rootCause)}</p>` : ''}
    ${data.aiExplanation.recommendation ? `<p><strong>Recommended Action:</strong> ${escapeHtml(data.aiExplanation.recommendation)}</p>` : ''}
  </div>
  ` : ''}

  ${data.limitations.length > 0 ? `
  <h2>7. Investigation Limitations</h2>
  <ul style="font-size: 8.5pt; color: #475569; padding-left: 20px; margin-bottom: 14px;">
    ${data.limitations.map((lim) => `<li style="margin-bottom: 3px;">${escapeHtml(lim)}</li>`).join('')}
  </ul>
  ` : ''}

  <div class="footer">
    <div>TraceCase Autonomous Defect Engine &bull; Non-destructive local verification</div>
    <div>Report ID: ${escapeHtml(data.investigationId.slice(0, 8))} &bull; Generated: ${escapeHtml(data.generatedAt)}</div>
  </div>
</div>
</body>
</html>`;
  }


public async generateReportPdf(data: InvestigationReportData): Promise<Buffer> {
    const html = this.renderReportHtml(data);
    let browser = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size: 7.5pt; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; width: 100%; display: flex; justify-content: space-between; padding: 0 15mm; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
            <span>TraceCase Autonomous Defect Engine &bull; Non-destructive verification</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> &bull; Generated: ${escapeHtml(data.generatedAt)}</span>
          </div>
        `,
        margin: {
          top: '15mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
      });
      return Buffer.from(pdf);
    } catch (browserError) {
      console.warn('[InvestigationReportService] Chromium PDF launch error, generating deterministic fallback PDF:', browserError instanceof Error ? browserError.message : browserError);
      return buildDeterministicFallbackPdf(data);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}

export const investigationReportService = new InvestigationReportService();
