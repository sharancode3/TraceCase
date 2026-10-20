import { NextRequest, NextResponse } from 'next/server';
import {
  BatchAnswerClarificationsCommandSchema,
  AnswerClarificationCommandSchema,
} from '@/contracts/clarification';
import { requireAuthenticatedPrincipal } from '@/server/auth';
import { createSafeError } from '@/contracts/errors';
import { isDevPreviewEnabled } from '@/server/config/env';
import { investigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import {
  handleWorkflowError,
  extractIdempotencyKey,
  executeWithIdempotency,
} from '@/server/workflow/workflow-http';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const rawBody = await req.json();

    // Support single answer or batch answers
    let answers: Array<{ questionId: string; answerText: string }> = [];
    let expectedWorkflowRevision: number | undefined = undefined;

    const batchParsed = BatchAnswerClarificationsCommandSchema.safeParse(rawBody);
    if (batchParsed.success) {
      answers = batchParsed.data.answers;
      expectedWorkflowRevision = batchParsed.data.expectedWorkflowRevision;
    } else {
      const singleParsed = AnswerClarificationCommandSchema.safeParse(rawBody);
      if (singleParsed.success) {
        answers = [{ questionId: singleParsed.data.questionId, answerText: singleParsed.data.answerText }];
        expectedWorkflowRevision = singleParsed.data.expectedWorkflowRevision;
      } else {
        return NextResponse.json(
          createSafeError(
            'VALIDATION_FAILED',
            'INVALID_ANSWER_PAYLOAD',
            'Validation failed: payload must be a single answer or batch answers',
            batchParsed.error.format()
          ),
          { status: 400 }
        );
      }
    }

    if (isDevPreviewEnabled()) {
      return NextResponse.json({
        data: answers.map((a) => ({ ...a, isAnswered: true, answeredAt: new Date().toISOString() })),
        status: 'ANSWERED',
        isSimulatedPreview: true,
      });
    }

    const principal = await requireAuthenticatedPrincipal(req);
    const idempotencyKey = extractIdempotencyKey(req, rawBody as Record<string, unknown>);

    return await executeWithIdempotency({
      principalId: principal.id,
      idempotencyKey,
      resourceId: id,
      commandName: 'ANSWER_CLARIFICATIONS',
      payload: { answers, expectedWorkflowRevision },
      handler: async () => {
        const result = await investigationWorkflowService.answerClarifications({
          investigationId: id,
          ownerId: principal.id,
          answers,
          expectedWorkflowRevision,
        });

        return {
          status: 200,
          body: {
            data: result.answers,
            workflowRevision: result.workflowRevision,
          },
        };
      },
    });
  } catch (error) {
    return handleWorkflowError(error);
  }
}
