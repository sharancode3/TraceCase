import { NextRequest, NextResponse } from 'next/server';
import {
  CreateReportCommandSchema,
  DraftReportIntakeSchema,
  CreateReportCommand,
  DraftReportIntake,
} from '@/contracts/reports';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { reportsRepository } from '@/server/db/repositories/reports.repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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

    // In preview mode, return explicitly simulated report creation
    

    // Live mode: requires authenticated principal
    const principal = await requireAuthenticatedPrincipal(req);

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

    return NextResponse.json(
      {
        data: {
          ...report,
          investigationId: investigation.id,
        },
        created: true,
        mode: 'live',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 403 });
    }
    return NextResponse.json(
      createSafeError('SERVICE_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE', error instanceof Error ? error.message : 'Database write unavailable'),
      { status: 503 }
    );
  }
}
