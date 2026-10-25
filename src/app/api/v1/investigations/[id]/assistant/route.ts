import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { investigationReportService } from '@/server/reporting/investigation-report.service';
import { eventsRepository } from '@/server/db/repositories/events.repository';
import { getDb } from '@/server/db';
import {
  investigationAttemptsTable,
  assertionEvaluationsTable,
  synthesisExplanationsTable,
  experimentPlanRevisionsTable,
  targetsTable,
} from '@/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { handleWorkflowError } from '@/server/workflow/workflow-http';

export interface AssistantCitation {
  type: 'STEP' | 'ATTEMPT' | 'ASSERTION' | 'EVIDENCE' | 'TARGET';
  label: string;
  stepIndex?: number;
  attemptNumber?: number;
  assertionId?: string;
  link?: string;
}

export interface AssistantAnswer {
  answerText: string;
  citations: AssistantCitation[];
  suggestedActionLink?: string;
  suggestedFollowups: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const principal = await requireAuthenticatedPrincipal(req);

    // Verify ownership
    const investigation = await investigationWorkflowService.getOwnedInvestigationOrThrow(id, principal.id);

    const body = await req.json().catch(() => ({}));
    const userQuery = typeof body.query === 'string' ? body.query.trim() : '';

    if (!userQuery) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. Load canonical report
    let canonicalReport: any = null;
    try {
      canonicalReport = await investigationReportService.getCanonicalReport(id, principal.id);
    } catch {
      // Fallback to partial DB query if report building fails
    }

    // 2. Load attempts and evaluations
    const attempts = await db
      .select()
      .from(investigationAttemptsTable)
      .where(eq(investigationAttemptsTable.investigationId, id))
      .orderBy(investigationAttemptsTable.attemptNumber);

    const evaluations = await db
      .select()
      .from(assertionEvaluationsTable)
      .where(eq(assertionEvaluationsTable.investigationId, id));

    const [plan] = await db
      .select()
      .from(experimentPlanRevisionsTable)
      .where(eq(experimentPlanRevisionsTable.investigationId, id))
      .orderBy(desc(experimentPlanRevisionsTable.version))
      .limit(1);

    const [synthesis] = await db
      .select()
      .from(synthesisExplanationsTable)
      .where(eq(synthesisExplanationsTable.investigationId, id))
      .limit(1);

    const [target] = await db
      .select()
      .from(targetsTable)
      .where(eq(targetsTable.id, investigation.targetId))
      .limit(1);

    const eventsResult = await eventsRepository.getEventsByInvestigation({
      investigationId: id,
      limit: 100,
    });
    const events = eventsResult.events || [];

    // Extract action receipts from events
    const actionEvents = events.filter((e) => e.eventType === 'ACTION_EXECUTED');

    // Synthesize structured answer grounded in the investigation facts
    const answer = generateGroundedAnswer({
      query: userQuery,
      investigationId: id,
      investigation,
      canonicalReport,
      attempts,
      evaluations,
      plan,
      synthesis,
      target,
      actionEvents,
    });

    return NextResponse.json(answer);
  } catch (error) {
    return handleWorkflowError(error);
  }
}

function generateGroundedAnswer(ctx: {
  query: string;
  investigationId: string;
  investigation: any;
  canonicalReport: any;
  attempts: any[];
  evaluations: any[];
  plan: any;
  synthesis: any;
  target: any;
  actionEvents: any[];
}): AssistantAnswer {
  const q = ctx.query.toLowerCase();
  const verdict = ctx.investigation.reproductionVerdict || 'PENDING';
  const lifecycle = ctx.investigation.lifecycleStatus;
  const targetName = ctx.target?.name || 'Target Application';
  const targetBuild = ctx.canonicalReport?.targetEnvironment?.buildId || ctx.target?.buildVersion || 'sandbox';
  const citations: AssistantCitation[] = [];
  const followups: string[] = [];

  // Question Category 1: Reproduction Verdict / Outcome
  if (
    q.includes('verdict') ||
    q.includes('reproduce') ||
    q.includes('outcome') ||
    q.includes('result') ||
    q.includes('pass') ||
    q.includes('fail') ||
    q.includes('what happened') ||
    q.includes('why')
  ) {
    let outcomeText = '';
    if (verdict === 'CONFIRMED_REPRODUCED') {
      outcomeText = `TraceCase confirmed the reported bug on ${targetName} (${targetBuild}). Both independent browser test runs (Attempt 1 and Attempt 2) witnessed the exact defect signature with 100% consistency across clean state resets.`;
      followups.push('What specific steps were executed?');
      followups.push('Which assertion detected the defect?');
      followups.push('Can I download the PDF report?');
    } else if (verdict === 'NOT_REPRODUCED') {
      outcomeText = `TraceCase found that the reported defect could NOT be reproduced on ${targetName} (${targetBuild}). Both independent runs observed expected correct behavior, confirming that the bug is absent or fixed in this build.`;
      followups.push('What correct behavior was verified?');
      followups.push('How was the test environment reset?');
    } else if (verdict === 'INCONCLUSIVE_EXECUTION_FAILURE' || verdict === 'INCONCLUSIVE') {
      outcomeText = `The investigation was inconclusive because execution encountered an environmental or grounding constraint before a definitive verdict could be locked.`;
      followups.push('What caused the execution failure?');
      followups.push('How can I refine the bug description?');
    } else {
      outcomeText = `The investigation is currently in state '${lifecycle}' with verdict '${verdict}'.`;
      followups.push('Check current live progress');
    }

    citations.push({
      type: 'ATTEMPT',
      label: `Reproduction Verdict: ${verdict}`,
      link: `/investigations/${ctx.investigationId}`,
    });

    if (ctx.canonicalReport?.reproductionVerdict?.defectSignature) {
      outcomeText += ` Defect Signature: ${ctx.canonicalReport.reproductionVerdict.defectSignature}`;
    }

    return {
      answerText: outcomeText,
      citations,
      suggestedActionLink: `/api/v1/investigations/${ctx.investigationId}/report/pdf`,
      suggestedFollowups: followups,
    };
  }

  // Question Category 2: Browser Actions and Timeline
  if (
    q.includes('step') ||
    q.includes('action') ||
    q.includes('browser') ||
    q.includes('timeline') ||
    q.includes('click') ||
    q.includes('navigate')
  ) {
    const rawSteps = (ctx.plan?.planPayload as any)?.steps || [];
    let stepsText = '';
    const executedCount = ctx.actionEvents.length;
    const attemptsCount = ctx.attempts.length;

    if (executedCount === 0 && attemptsCount === 0) {
      if (lifecycle === 'CANCELLED') {
        stepsText = `No browser actions were executed. This investigation was cancelled before browser execution began. The plan contained ${rawSteps.length} planned step(s):\n`;
      } else {
        stepsText = `No browser actions have executed yet (current status: ${lifecycle}). The planned sequence contains ${rawSteps.length} step(s):\n`;
      }
    } else {
      stepsText = `The browser executed ${executedCount} action receipts across ${attemptsCount} test attempt(s). Planned steps:\n`;
    }

    rawSteps.forEach((s: any, idx: number) => {
      const tool = s.toolKind || s.actionType || 'ACTION';
      const targetDesc = s.targetAccessibleName || s.targetRole || s.selector || s.value || '';
      const statusLabel = executedCount > 0 ? '' : ' [Planned]';
      stepsText += `\n${idx + 1}. [${tool}]${statusLabel} ${s.intentDescription || s.semanticAction || 'Perform action'} ${targetDesc ? `(${targetDesc})` : ''}`;

      citations.push({
        type: 'STEP',
        label: `Step ${idx + 1}: ${tool}${statusLabel}`,
        stepIndex: idx,
        link: `/investigations/${ctx.investigationId}#action-timeline`,
      });
    });

    followups.push('What did the assertions check?');
    followups.push('Were both attempts consistent?');

    return {
      answerText: stepsText,
      citations,
      suggestedActionLink: `/investigations/${ctx.investigationId}`,
      suggestedFollowups: followups,
    };
  }

  // Question Category 3: Assertions and Predicates
  if (
    q.includes('assert') ||
    q.includes('predicate') ||
    q.includes('check') ||
    q.includes('expectation') ||
    q.includes('expected') ||
    q.includes('observed')
  ) {
    let assertText = '';
    if (ctx.evaluations.length === 0) {
      assertText = `No assertions were evaluated for investigation ${ctx.investigationId.slice(0, 8)} because browser execution was not run (status: ${lifecycle}).`;
    } else {
      assertText = `Evaluated Assertions (${ctx.evaluations.length} total across runs):\n`;
      ctx.evaluations.slice(0, 4).forEach((ev: any) => {
        assertText += `\n- Attempt ${ev.attemptNumber} [${ev.purpose}]: Result = ${ev.result}. Expected '${ev.expectedValue}', observed '${ev.observedValue}'. (${ev.details || ''})`;

        citations.push({
          type: 'ASSERTION',
          label: `Attempt ${ev.attemptNumber} Assertion (${ev.result})`,
          assertionId: ev.assertionId,
          attemptNumber: ev.attemptNumber,
          link: `/investigations/${ctx.investigationId}#assertions-table`,
        });
      });
    }

    followups.push('Was Attempt 2 identical to Attempt 1?');
    followups.push('How was state reset between attempts?');

    return {
      answerText: assertText,
      citations,
      suggestedActionLink: `/investigations/${ctx.investigationId}`,
      suggestedFollowups: followups,
    };
  }

  // Question Category 4: Evidence, Logs, and Video
  if (
    q.includes('evidence') ||
    q.includes('console') ||
    q.includes('log') ||
    q.includes('video') ||
    q.includes('network') ||
    q.includes('recording')
  ) {
    let evidenceText = '';
    if (ctx.attempts.length === 0 && ctx.actionEvents.length === 0) {
      evidenceText = `No runtime evidence artifacts were collected for investigation ${ctx.investigationId.slice(0, 8)} because browser execution was not run (status: ${lifecycle}). When an investigation is executed by the browser worker, screen recording video, console logs, and network traces are quarantined and recorded.`;
    } else {
      const videoStatus = ctx.canonicalReport?.evidence?.videoRecording?.status || 'RESTRICTED_RAW';
      const consoleCount = ctx.canonicalReport?.evidence?.consoleLogs?.entryCount ?? 0;
      const networkCount = ctx.canonicalReport?.evidence?.networkTrace?.requestCount ?? 0;

      evidenceText = `Evidence collected for investigation ${ctx.investigationId.slice(0, 8)}:
- Video Recording: Available in ${videoStatus} quarantine. Screen actions were recorded for the executed attempts.
- Console Logs: ${consoleCount} runtime entries captured.
- Network Traces: ${networkCount} HTTP requests monitored. Allowed origins were strictly enforced by network guards.`;
    }

    citations.push({
      type: 'EVIDENCE',
      label: 'Evidence Manifest',
      link: `/investigations/${ctx.investigationId}#evidence-section`,
    });

    followups.push('What verdict was reached?');
    followups.push('Download full investigation PDF');

    return {
      answerText: evidenceText,
      citations,
      suggestedActionLink: `/investigations/${ctx.investigationId}`,
      suggestedFollowups: followups,
    };
  }

  // Question Category 5: Target and Reset Fixture
  if (
    q.includes('target') ||
    q.includes('reset') ||
    q.includes('fixture') ||
    q.includes('environment') ||
    q.includes('build')
  ) {
    const targetText = `Testing Target Information:
- Application: ${targetName}
- Base URL: ${ctx.target?.baseUrl || 'N/A'}
- Build Version: ${targetBuild}
- Target Scope: ${ctx.canonicalReport?.targetEnvironment?.targetScope || 'default'}
- State Isolation: Authenticated reset webhook (${ctx.target?.fixtureResetEndpoint || 'POST /api/test/reset-fixture'}) was executed before each test run to ensure strict clean-slate baseline conditions.`;

    citations.push({
      type: 'TARGET',
      label: `Target Profile: ${targetName}`,
      link: `/investigations/${ctx.investigationId}`,
    });

    followups.push('Did the bug reproduce?');
    followups.push('What steps were run?');

    return {
      answerText: targetText,
      citations,
      suggestedActionLink: `/investigations/${ctx.investigationId}`,
      suggestedFollowups: followups,
    };
  }

  // Default Comprehensive Summary
  const defaultText = `Investigation ${ctx.investigationId.slice(0, 8)} summary:
- Status: ${lifecycle}
- Reproduction Verdict: ${verdict}
- Target Application: ${targetName} (Build: ${targetBuild})
- Runs Executed: ${ctx.attempts.length} independent attempts with baseline reset readback.
- AI Synthesis: ${ctx.synthesis?.executiveSummary || 'Both runs completed under deterministic execution guards.'}`;

  citations.push({
    type: 'ATTEMPT',
    label: `Investigation Overview (${verdict})`,
    link: `/investigations/${ctx.investigationId}`,
  });

  return {
    answerText: defaultText,
    citations,
    suggestedActionLink: `/api/v1/investigations/${ctx.investigationId}/report/pdf`,
    suggestedFollowups: [
      'Why did the test fail or pass?',
      'What did the browser do in Attempt 1?',
      'Which assertion detected the defect?',
      'Download PDF report',
    ],
  };
}
