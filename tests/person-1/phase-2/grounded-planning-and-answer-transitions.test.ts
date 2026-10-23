import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InvestigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { ClarificationsRepository } from '@/server/db/repositories/clarifications.repository';
import { setCustomVerifierForTesting } from '@/server/auth/jwt';
import { resetDbInstanceForTesting, setDbInstanceForTesting } from '@/server/db';
import { ReportClarificationAgentPort } from '@/server/services/ports';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '@/server/workflow/workflow-errors';
import { POST as handleAnswerPost } from '@/app/api/v1/investigations/[id]/clarifications/answer/route';
import { NextRequest } from 'next/server';

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
}

import { getTableName } from 'drizzle-orm';

function extractEqualityChecks(node: any): Array<{ column: string; expectedValue: any }> {
  if (!node) return [];
  const checks: Array<{ column: string; expectedValue: any }> = [];

  function walk(n: any) {
    if (!n) return;
    if (n.queryChunks && Array.isArray(n.queryChunks)) {
      const chunks = n.queryChunks;
      for (let i = 0; i < chunks.length; i++) {
        const cur = chunks[i];
        if (cur && cur.name && chunks[i + 1]?.value?.[0] === ' = ' && chunks[i + 2]?.value !== undefined) {
          checks.push({ column: cur.name, expectedValue: chunks[i + 2].value });
        } else if (cur && cur.queryChunks) {
          walk(cur);
        }
      }
    }
  }

  walk(node);
  return checks;
}

function matchesAll(row: any, checks: Array<{ column: string; expectedValue: any }>): boolean {
  for (const check of checks) {
    const colSnake = check.column;
    const colCamel = toCamel(check.column);
    const actual = row[colCamel] !== undefined ? row[colCamel] : row[colSnake];
    if (actual !== check.expectedValue) {
      return false;
    }
  }
  return true;
}

class GroundedPlanningDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];
  public clarificationQuestions: any[] = [];
  public experimentPlanRevisions: any[] = [];
  public investigationEvents: any[] = [];
  public forUpdateCalls: string[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'clarification_questions') return this.clarificationQuestions;
    if (tableName === 'experiment_plan_revisions') return this.experimentPlanRevisions;
    if (tableName === 'investigation_events') return this.investigationEvents;
    return [];
  }

  select(selectFields?: any) {
    return {
      from: (table: any) => {
        const tableArray = this.getTableArray(table);
        const tableName = getTableName(table);

        const buildQueryResult = (filterFn?: (row: any) => boolean) => {
          const getRows = () => (filterFn ? tableArray.filter(filterFn) : [...tableArray]);
          return {
            for: (mode: string) => {
              if (tableName === 'investigations') {
                this.forUpdateCalls.push(mode);
              }
              return buildQueryResult(filterFn);
            },
            orderBy: () => buildQueryResult(filterFn),
            limit: (n: number) => Promise.resolve(getRows().slice(0, n)),
            then: (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
          };
        };

        return {
          for: (mode: string) => {
            if (tableName === 'investigations') {
              this.forUpdateCalls.push(mode);
            }
            return buildQueryResult();
          },
          where: (condition: any) => {
            const checks = extractEqualityChecks(condition);
            return buildQueryResult((row) => matchesAll(row, checks));
          },
          orderBy: () => buildQueryResult(),
          limit: (n: number) => Promise.resolve(tableArray.slice(0, n)),
          then: (resolve: any, reject: any) => Promise.resolve([...tableArray]).then(resolve, reject),
        };
      },
    };
  }

  insert(table: any) {
    return {
      values: (valOrVals: any) => {
        const now = new Date();
        const rowsToInsert = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
        const inserted: any[] = [];
        const tableName = getTableName(table);

        for (const val of rowsToInsert) {
          const row = {
            ...val,
            id: val.id || crypto.randomUUID(),
            createdAt: val.createdAt || now,
            updatedAt: val.updatedAt || now,
          };

          if (tableName === 'clarification_questions') {
            this.clarificationQuestions.push(row);
          } else if (tableName === 'investigations') {
            this.investigations.push(row);
          } else if (tableName === 'bug_reports') {
            this.bugReports.push(row);
          } else if (tableName === 'targets') {
            this.targets.push(row);
          } else if (tableName === 'experiment_plan_revisions') {
            this.experimentPlanRevisions.push(row);
          } else if (tableName === 'investigation_events') {
            this.investigationEvents.push(row);
          }
          inserted.push(row);
        }

        return {
          returning: () => Promise.resolve(inserted),
          then: (resolve: any, reject: any) => Promise.resolve(inserted).then(resolve, reject),
        };
      },
    };
  }

  update(table: any) {
    return {
      set: (updateValues: any) => {
        return {
          where: (condition: any) => {
            const checks = extractEqualityChecks(condition);
            const tableArray = this.getTableArray(table);
            const updatedRows: any[] = [];

            for (const row of tableArray) {
              if (matchesAll(row, checks)) {
                Object.assign(row, updateValues, { updatedAt: new Date() });
                updatedRows.push(row);
              }
            }

            return {
              returning: () => Promise.resolve(updatedRows),
              then: (resolve: any, reject: any) => Promise.resolve(updatedRows).then(resolve, reject),
            };
          },
        };
      },
    };
  }

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

describe('Phase G: Grounded Luna Planning and Recoverable Answer Transitions', () => {
  let dbMock: GroundedPlanningDbMock;
  let repo: ClarificationsRepository;
  let workflowService: InvestigationWorkflowService;

  const OWNER_ID = '00000000-0000-4000-a000-000000000001';
  const OTHER_USER_ID = '00000000-0000-4000-a000-000000000002';
  const TARGET_ID = '00000000-0000-4000-b000-000000000001';
  const REPORT_ID = '00000000-0000-4000-c000-000000000001';
  const INVESTIGATION_ID = '00000000-0000-4000-d000-000000000001';

  beforeEach(() => {
    dbMock = new GroundedPlanningDbMock();
    setDbInstanceForTesting(dbMock as any);
    repo = new ClarificationsRepository(() => dbMock as any);
    workflowService = new InvestigationWorkflowService(() => dbMock as any);

    dbMock.principals.push({
      id: OWNER_ID,
      email: 'operator@tracecase.test',
      roles: ['operator'],
    });

    dbMock.targets.push({
      id: TARGET_ID,
      ownerId: OWNER_ID,
      name: 'Task Demo App',
      baseUrl: 'http://localhost:3005',
      environment: 'staging',
      allowedOrigins: ['http://localhost:3005'],
      isSandbox: true,
      hasResetCapability: true,
    });

    dbMock.bugReports.push({
      id: REPORT_ID,
      ownerId: OWNER_ID,
      targetId: TARGET_ID,
      title: 'Filter issue on tasks',
      bugDescription: 'Filter active shows nothing after task deletion',
      rawDescription: 'Filter active shows nothing after task deletion',
      expectedBehavior: 'Filter active shows remaining active tasks',
      observedBehavior: 'Empty task list is rendered',
      suspectedSteps: ['Open app', 'Delete task B', 'Click Active filter'],
    });

    dbMock.investigations.push({
      id: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      targetId: TARGET_ID,
      reportId: REPORT_ID,
      lifecycleStatus: 'ACTIVE',
      reviewStatus: 'DRAFT',
      workflowRevision: 1,
    });

    setCustomVerifierForTesting(async (token: string) => {
      if (token === 'mock-token') {
        return {
          issuer: 'https://auth.tracecase.test',
          subject: OWNER_ID,
          roles: ['operator'],
          rawPayload: {},
        };
      }
      throw new Error('Invalid test token');
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
    setCustomVerifierForTesting(null);
  });

  it('1. Fact Assembly with Provenance: preserves reporter claims, target config and answers distinctly', async () => {
    let capturedReportInput: any = null;
    const mockPlanner: ReportClarificationAgentPort = {
      generateProposal: async (params) => {
        capturedReportInput = params.report;
        return {
          status: 'CLARIFICATION_NEEDED',
          preliminaryUnderstanding: 'Clarification required for task IDs',
          questions: [
            {
              questionId: 'q_1',
              questionText: 'Which specific task was deleted?',
              explanation: 'Identifies affected entity',
              suggestedOptions: ['Task A', 'Task B'],
            },
          ],
        };
      },
    };

    const result = await workflowService.requestPlanning({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      plannerPort: mockPlanner,
    });

    expect(result.status).toBe('CLARIFICATION_NEEDED');
    expect(capturedReportInput).toBeDefined();

    // Verify explicit provenance tagging
    const facts = capturedReportInput.knownFacts;
    expect(facts['[Target Config] Base URL']).toBe('http://localhost:3005');
    expect(facts['[Target Config] Environment']).toBe('staging');
    expect(facts['[Reporter Claim] Bug Title']).toBe('Filter issue on tasks');
    expect(facts['[Reporter Claim] Claimed Expected Behavior']).toBe('Filter active shows remaining active tasks');
    expect(facts['[Reporter Claim] Claimed Failure Signature']).toBe('Empty task list is rendered');
    expect(facts['[Reporter Claim] Suspected Steps']).toBe('Open app -> Delete task B -> Click Active filter');
  });

  it('2. Answer Persistence: accepts both option selection and free-form text answers', async () => {
    // Save 2 questions
    const [q1, q2] = await repo.saveQuestions(INVESTIGATION_ID, [
      {
        questionText: 'Which task was deleted?',
        explanation: 'Target item',
        suggestedOptions: ['Task A', 'Task B'],
      },
      {
        questionText: 'Did you observe any error banner?',
        explanation: 'Visual notification check',
        suggestedOptions: ['Yes', 'No'],
      },
    ]);

    // Submit answers: q1 with option selection, q2 with freeform custom text
    const answerResult = await workflowService.answerClarifications({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      answers: [
        { questionId: q1.id, answerText: 'Task B' },
        { questionId: q2.id, answerText: 'A yellow toast flashed: "Item removed"' },
      ],
      expectedWorkflowRevision: 1,
    });

    expect(answerResult.workflowRevision).toBe(2);
    expect(answerResult.answers).toHaveLength(2);

    // Verify stored records
    const stored = await repo.listQuestions(INVESTIGATION_ID);
    const storedQ1 = stored.find((q) => q.id === q1.id);
    const storedQ2 = stored.find((q) => q.id === q2.id);

    expect(storedQ1?.isAnswered).toBe(true);
    expect(storedQ1?.answerText).toBe('Task B');
    expect(storedQ2?.isAnswered).toBe(true);
    expect(storedQ2?.answerText).toBe('A yellow toast flashed: "Item removed"');
  });

  it('3. Multi-Round Clarification Progression: rebuilds fact ledger and appends subsequent round', async () => {
    // Round 1
    const [q1] = await repo.saveQuestions(INVESTIGATION_ID, [
      {
        questionText: 'Which task was deleted?',
        explanation: 'Target item',
        suggestedOptions: ['Task A', 'Task B'],
      },
    ]);

    // Answer Round 1
    await workflowService.answerClarifications({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      answers: [{ questionId: q1.id, answerText: 'Task B' }],
    });

    let capturedClarificationHistory: any[] = [];
    const round2Planner: ReportClarificationAgentPort = {
      generateProposal: async (params) => {
        capturedClarificationHistory = params.clarificationHistory || [];
        return {
          status: 'CLARIFICATION_NEEDED',
          preliminaryUnderstanding: 'Identified Task B; need filter behavior',
          questions: [
            {
              questionId: 'q_round2_1',
              questionText: 'Was the Active filter already selected prior to deletion?',
              explanation: 'Precondition order',
              suggestedOptions: ['Yes, Active was selected', 'No, All was selected'],
            },
          ],
        };
      },
    };

    const r2Result = await workflowService.requestPlanning({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      plannerPort: round2Planner,
    });

    expect(r2Result.status).toBe('CLARIFICATION_NEEDED');
    if (r2Result.status === 'CLARIFICATION_NEEDED') {
      expect(r2Result.questions).toHaveLength(1);
      expect(r2Result.questions[0].roundIndex).toBe(2);
      expect(r2Result.questions[0].questionIndex).toBe(1); // 0 was q1, 1 is q2
    }

    // Verify fact ledger passed to round 2 planner included round 1 answer
    expect(capturedClarificationHistory).toHaveLength(1);
    expect(capturedClarificationHistory[0].questionText).toBe('Which task was deleted?');
    expect(capturedClarificationHistory[0].selectedOption).toBe('Task B');
  });

  it('4. Clarification Limit: transitions to UNABLE_TO_PROCEED after 3 rounds', async () => {
    // Pre-populate 3 completed rounds (questions with round_index 1, 2, 3)
    await repo.saveQuestions(
      INVESTIGATION_ID,
      [{ questionText: 'Q1' }],
      { roundIndex: 1 }
    );
    await repo.saveQuestions(
      INVESTIGATION_ID,
      [{ questionText: 'Q2' }],
      { roundIndex: 2 }
    );
    await repo.saveQuestions(
      INVESTIGATION_ID,
      [{ questionText: 'Q3' }],
      { roundIndex: 3 }
    );

    // Mark all 3 questions answered
    const allQ = await repo.listQuestions(INVESTIGATION_ID);
    for (const q of allQ) {
      await repo.answerQuestion(q.id, INVESTIGATION_ID, 'Answer', OWNER_ID);
    }

    // Planner attempts a 4th round of clarification
    const infinitePlanner: ReportClarificationAgentPort = {
      generateProposal: async () => ({
        status: 'CLARIFICATION_NEEDED',
        preliminaryUnderstanding: 'Need even more details',
        questions: [{ questionId: 'q4', questionText: 'Question 4?' }],
      }),
    };

    const result = await workflowService.requestPlanning({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      plannerPort: infinitePlanner,
    });

    expect(result.status).toBe('UNABLE_TO_PROCEED');
    if (result.status === 'UNABLE_TO_PROCEED') {
      expect(result.reason).toContain('Maximum clarification rounds (3) reached');
    }

    // Investigation status updated to BLOCKED
    const inv = dbMock.investigations.find((i) => i.id === INVESTIGATION_ID);
    expect(inv.reviewStatus).toBe('BLOCKED');
  });

  it('5. Avoid Repeating Answered Questions: filters out duplicate questions already answered', async () => {
    // Persist and answer a question
    const [q1] = await repo.saveQuestions(INVESTIGATION_ID, [
      { questionText: 'Which task was deleted?' },
    ]);
    await repo.answerQuestion(q1.id, INVESTIGATION_ID, 'Task B', OWNER_ID);

    // Planner returns 2 questions: one identical to q1, one genuine new question
    const repeatingPlanner: ReportClarificationAgentPort = {
      generateProposal: async () => ({
        status: 'CLARIFICATION_NEEDED',
        preliminaryUnderstanding: 'Refining facts',
        questions: [
          { questionId: 'q_rep', questionText: 'Which task was deleted?' }, // Repeated
          { questionId: 'q_new', questionText: 'Which browser was used?' }, // New
        ],
      }),
    };

    const result = await workflowService.requestPlanning({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      plannerPort: repeatingPlanner,
    });

    expect(result.status).toBe('CLARIFICATION_NEEDED');
    if (result.status === 'CLARIFICATION_NEEDED') {
      // The repeated question was filtered out; only the new question was persisted
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].questionText).toBe('Which browser was used?');
    }
  });

  it('6. Preservation Across Failure: accepted answers survive downstream planning failures', async () => {
    // Question answered
    const [q1] = await repo.saveQuestions(INVESTIGATION_ID, [
      { questionText: 'Which task was deleted?' },
    ]);
    await workflowService.answerClarifications({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      answers: [{ questionId: q1.id, answerText: 'Task B' }],
    });

    // Downstream planner throws network/provider failure
    const failingPlanner: ReportClarificationAgentPort = {
      generateProposal: async () => {
        throw new Error('OpenAI service timeout (504)');
      },
    };

    await expect(
      workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: failingPlanner,
      })
    ).rejects.toThrow('OpenAI service timeout (504)');

    // Verify stored answer was NOT lost or reverted
    const questions = await repo.listQuestions(INVESTIGATION_ID);
    expect(questions[0].isAnswered).toBe(true);
    expect(questions[0].answerText).toBe('Task B');

    // Subsequent retry with healthy planner succeeds using the stored answer
    const healthyPlanner: ReportClarificationAgentPort = {
      generateProposal: async (params) => {
        expect(params.clarificationHistory?.[0].selectedOption).toBe('Task B');
        return {
          status: 'EXPERIMENT_PROPOSED',
          proposal: {
            preconditions: ['Target baseline restored'],
            steps: [
              {
                stepIndex: 0,
                semanticAction: 'Open app',
                toolKind: 'navigate',
                selector: 'window',
                targetAccessibleName: 'Home',
                targetRole: 'page',
                value: 'http://localhost:3005',
                tier: 'TIER_1_READ_ONLY',
                timeoutMs: 10000,
              },
            ],
            expectedCorrectBehavior: 'Remaining tasks displayed',
            reportedFailureSignature: 'Task list empty',
            assertions: [
              {
                id: '00000000-0000-4000-e000-000000000001',
                predicateId: 'assert_exists',
                kind: 'ENTITY_PRESENCE',
                source: 'DOM_ELEMENT',
                purpose: 'EXPECTED_CORRECT_BEHAVIOR',
                subjectRef: '[data-task-id="task-a"]',
                operator: 'EXISTS',
                expectedValue: 'true',
                settlingPoint: 'AFTER_NETWORK_IDLE',
                description: 'Task A exists',
              },
              {
                id: '00000000-0000-4000-e000-000000000002',
                predicateId: 'assert_fail',
                kind: 'ENTITY_PRESENCE',
                source: 'DOM_ELEMENT',
                purpose: 'REPORTED_FAILURE_SIGNATURE',
                subjectRef: '[data-task-id="task-a"]',
                operator: 'NOT_EXISTS',
                expectedValue: 'true',
                settlingPoint: 'AFTER_NETWORK_IDLE',
                description: 'Task A missing',
              },
            ],
            requiresResetHook: false,
          },
        };
      },
    };

    const successResult = await workflowService.requestPlanning({
      investigationId: INVESTIGATION_ID,
      ownerId: OWNER_ID,
      plannerPort: healthyPlanner,
    });

    expect(successResult.status).toBe('PROPOSAL_READY');
  });

  it('7. Rejection of Foreign & Stale Question IDs: fails safely with appropriate error types', async () => {
    // Foreign question ID that doesn't exist
    await expect(
      workflowService.answerClarifications({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        answers: [{ questionId: '00000000-0000-4000-f000-000000000999', answerText: 'Value' }],
      })
    ).rejects.toBeInstanceOf(NotFoundError);

    // Stale workflow revision
    const [q1] = await repo.saveQuestions(INVESTIGATION_ID, [
      { questionText: 'Question 1?' },
    ]);
    await expect(
      workflowService.answerClarifications({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        answers: [{ questionId: q1.id, answerText: 'Value' }],
        expectedWorkflowRevision: 999, // Stale!
      })
    ).rejects.toBeInstanceOf(ConflictError);

    // Prior round answer rejection when newer round is active
    await repo.answerQuestion(q1.id, INVESTIGATION_ID, 'Initial', OWNER_ID);
    const [q2] = await repo.saveQuestions(
      INVESTIGATION_ID,
      [{ questionText: 'Question 2?' }],
      { roundIndex: 2 }
    );

    // Trying to re-answer q1 while q2 is active pending round
    await expect(
      workflowService.answerClarifications({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        answers: [{ questionId: q1.id, answerText: 'New text for old round' }],
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('8. Malformed Luna Output: creates no approval-ready plan and fails validation cleanly', async () => {
    const malformedPlanner: ReportClarificationAgentPort = {
      generateProposal: async () =>
        ({
          // Missing required fields and invalid status
          status: 'SOMETHING_FABRICATED',
        } as any),
    };

    await expect(
      workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: malformedPlanner,
      })
    ).rejects.toBeInstanceOf(ValidationFailedError);

    // Verify investigation was NOT transitioned to PROPOSAL_READY
    const inv = dbMock.investigations.find((i) => i.id === INVESTIGATION_ID);
    expect(inv.reviewStatus).not.toBe('PROPOSAL_READY');
    expect(dbMock.experimentPlanRevisions).toHaveLength(0);
  });

  it('9. Concurrency Protection: delayed competing planner response cannot overwrite newer state', async () => {
    const slowPlanner: ReportClarificationAgentPort = {
      generateProposal: async () => {
        // Simulate concurrent mutation while planner was thinking:
        // Another request advanced workflowRevision from 1 to 2
        const inv = dbMock.investigations.find((i) => i.id === INVESTIGATION_ID);
        inv.workflowRevision = 2;

        return {
          status: 'CLARIFICATION_NEEDED',
          preliminaryUnderstanding: 'Stale understanding',
          questions: [{ questionId: 'q_stale', questionText: 'Stale question?' }],
        };
      },
    };

    await expect(
      workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: slowPlanner,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
