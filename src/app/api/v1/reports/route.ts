import { NextRequest, NextResponse } from 'next/server';
import { CreateReportCommandSchema } from '@/contracts/reports';
import { requireAuthenticatedPrincipal, AuthenticationError, AuthorizationError } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';

export async function POST(req: NextRequest) {
  try {
    const principal = await requireAuthenticatedPrincipal(req);
    const body = await req.json();
    const parsed = CreateReportCommandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createSafeError('VALIDATION_FAILED', 'INVALID_REPORT_PAYLOAD', 'Payload validation failed', parsed.error.format()),
        { status: 400 }
      );
    }

    const reportId = crypto.randomUUID();
    const investigationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const createdReport = {
      id: reportId,
      investigationId,
      targetId: parsed.data.targetId,
      title: parsed.data.title,
      bugDescription: parsed.data.bugDescription,
      expectedBehavior: parsed.data.expectedBehavior,
      observedBehavior: parsed.data.observedBehavior,
      suspectedSteps: parsed.data.suspectedSteps || null,
      browserEnvironment: parsed.data.browserEnvironment || null,
      buildVersion: parsed.data.buildVersion || null,
      createdBy: principal.id,
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json({ data: createdReport, created: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.envelope, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(error.envelope, { status: 403 });
    }
    return NextResponse.json(
      createSafeError('INTERNAL_ERROR', 'SERVER_ERROR', error instanceof Error ? error.message : 'Unknown error'),
      { status: 500 }
    );
  }
}
