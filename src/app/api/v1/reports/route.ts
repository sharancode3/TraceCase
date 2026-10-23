import { NextRequest, NextResponse } from 'next/server';
import {
  CreateReportCommandSchema,
  DraftReportIntakeSchema,
  CreateReportCommand,
  DraftReportIntake,
} from '@/contracts/reports';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { reportsRepository } from '@/server/db/repositories/reports.repository';
import {
  extractIdempotencyKey,
  executeWithIdempotency,
  handleWorkflowError,
} from '@/server/workflow/workflow-http';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Support either full CreateReportCommand or DraftReportIntake
    const fullParsed = CreateReportCommandSchema.safeParse(body);
    let payload: CreateReportCommand | DraftReportIntake;

    if (fullParsed.success) {
      payload = fullParsed.data;
    } else {
      const draftParsed = DraftReportIntakeSchema.safeParse(body);
      if (draftParsed.success) {
        payload = draftParsed.data;
      } else {
        return NextResponse.json(
          createSafeError(
            'VALIDATION_FAILED',
            'INVALID_REPORT_PAYLOAD',
            'Payload validation failed',
            fullParsed.error.format()
          ),
          { status: 400 }
        );
      }
    }

    const bugDescription = 'bugDescription' in payload ? payload.bugDescription : payload.rawDescription;
    const rawDescription = 'rawDescription' in payload ? payload.rawDescription : undefined;

    // Live mode: requires authenticated principal
    const principal = await requireAuthenticatedPrincipal(req);
    const idempotencyKey = extractIdempotencyKey(req, body);

    return await executeWithIdempotency({
      principalId: principal.id,
      idempotencyKey,
      resourceId: payload.targetId,
      commandName: 'CREATE_REPORT',
      payload,
      handler: async () => {
        const { report, investigation } = await reportsRepository.createReportWithInvestigation({
          ownerId: principal.id,
          targetId: payload.targetId,
          title: payload.title,
          bugDescription,
          rawDescription,
          expectedBehavior: payload.expectedBehavior || null,
          observedBehavior: payload.observedBehavior || null,
          suspectedSteps: payload.suspectedSteps || null,
          browserEnvironment: payload.browserEnvironment || null,
          buildVersion: payload.buildVersion || null,
          createdBy: principal.id,
        });

        return {
          status: 201,
          body: {
            data: {
              ...report,
              investigationId: investigation.id,
            },
            created: true,
            mode: 'live',
          },
        };
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
