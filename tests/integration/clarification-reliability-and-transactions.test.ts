import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { ClarificationsRepository } from '@/server/db/repositories/clarifications.repository';
import { InvestigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import type { ReportClarificationAgentPort } from '@/server/services/ports';

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
}

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

class MockDb {
  public investigations: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public clarificationQuestions: any[] = [];
  public events: any[] = [];

  private getTable(table: any): any[] {
    const name = getTableName(table);
    if (name === 'investigations') return this.investigations;
    if (name === 'targets') return this.targets;
    if (name === 'bug_reports') return this.bugReports;
    if (name === 'clarification_questions') return this.clarificationQuestions;
    if (name === 'investigation_events') return this.events;
    return [];
  }

  select() {
    return {
      from: (table: any) => {
        const rows = this.getTable(table);
        const makeQuery = (filter?: (r: any) => boolean) => ({
          for: () => makeQuery(filter),
          orderBy: () => makeQuery(filter),
          limit: (n: number) => Promise.resolve((filter ? rows.filter(filter) : [...rows]).slice(0, n)),
          then: (res: any, rej: any) => Promise.resolve(filter ? rows.filter(filter) : [...rows]).then(res, rej),
        });
        return {
          for: () => makeQuery(),
          where: (cond: any) => {
            const checks = extractEqualityChecks(cond);
            return makeQuery((r) => matchesAll(r, checks));
          },
          orderBy: () => makeQuery(),
          limit: (n: number) => Promise.resolve(rows.slice(0, n)),
          then: (res: any, rej: any) => Promise.resolve([...rows]).then(res, rej),
        };
      },
    };
  }

  insert(table: any) {
    const rows = this.getTable(table);
    return {
      values: (val: any) => {
        const item = { ...val, id: val.id || ('gen-' + Math.random().toString(36).slice(2)) };
        rows.push(item);
        return {
          returning: () => Promise.resolve([item]),
          then: (res: any, rej: any) => Promise.resolve([item]).then(res, rej),
        };
      },
    };
  }

  update(table: any) {
    const rows = this.getTable(table);
    return {
      set: (updates: any) => ({
        where: (cond: any) => {
          const checks = extractEqualityChecks(cond);
          const matched = rows.filter((r) => matchesAll(r, checks));
          matched.forEach((r) => Object.assign(r, updates));
          return {
            returning: () => Promise.resolve(matched),
            then: (res: any, rej: any) => Promise.resolve(matched).then(res, rej),
          };
        },
      }),
    };
  }

  async transaction(fn: (tx: any) => Promise<any>) {
    // Snapshot state for atomic rollback simulation
    const snapshot = {
      investigations: JSON.parse(JSON.stringify(this.investigations)),
      clarificationQuestions: JSON.parse(JSON.stringify(this.clarificationQuestions)),
    };
    try {
      return await fn(this);
    } catch (err) {
      this.investigations = snapshot.investigations;
      this.clarificationQuestions = snapshot.clarificationQuestions;
      throw err;
    }
  }
}

describe('Investigation Clarification Reliability & Transaction Safety', () => {
  let db: MockDb;
  let repo: ClarificationsRepository;
  let service: InvestigationWorkflowService;

  const OWNER_ID = 'test-owner-001';
  const INV_ID = '11111111-1111-1111-1111-111111111111';
  const TARGET_ID = '22222222-2222-2222-2222-222222222222';
  const REPORT_ID = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    db = new MockDb();
    setDbInstanceForTesting(db as any);
    repo = new ClarificationsRepository(() => db as any);
    service = new InvestigationWorkflowService(() => db as any);

    db.investigations.push({
      id: INV_ID,
      ownerId: OWNER_ID,
      targetId: TARGET_ID,
      reportId: REPORT_ID,
      lifecycleStatus: 'ACTIVE',
      reviewStatus: 'CLARIFICATION_PENDING',
      workflowRevision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    db.targets.push({
      id: TARGET_ID,
      name: 'Workbench Target',
      baseUrl: 'http://localhost:3005',
      allowedOrigins: ['http://localhost:3005'],
      environment: 'staging',
      isSandbox: true,
      isSandboxVerified: true,
      hasResetHook: true,
    });

    db.bugReports.push({
      id: REPORT_ID,
      title: 'Active filter item deletion error',
      bugDescription: 'When active filter is enabled, deleting task deletes wrong item',
    });
  });

  afterEach(() => {
    resetDbInstanceForTesting();
  });

  it('prevents repeated clarification questions and terminates with UNABLE_TO_PROCEED when all questions were answered', async () => {
    // Round 1 question already answered
    db.clarificationQuestions.push({
      id: 'q-01',
      investigationId: INV_ID,
      questionIndex: 0,
      roundIndex: 1,
      questionText: 'Which item did you intend to delete?',
      isAnswered: true,
      answerText: 'Item wb-item-02',
    });

    // Mock planner returns the same question again
    const mockPlanner: ReportClarificationAgentPort = {
      generateProposal: async () => ({
        status: 'CLARIFICATION_NEEDED' as const,
        preliminaryUnderstanding: 'Item deletion on active filter',
        questions: [
          {
            questionId: 'q-01',
            questionText: 'Which item did you intend to delete?',
            explanation: 'Need item ID',
            suggestedOptions: ['wb-item-01', 'wb-item-02'],
          },
        ],
      }),
    };

    const result = await service.requestPlanning({
      investigationId: INV_ID,
      ownerId: OWNER_ID,
      plannerPort: mockPlanner,
      expectedWorkflowRevision: 1,
    });

    // Should transition to UNABLE_TO_PROCEED rather than repeating the question in an infinite loop
    expect(result.status).toBe('UNABLE_TO_PROCEED');
    expect(result.reason).toContain('No new clarification questions could be formulated');

    // Questions in DB must NOT be duplicated
    expect(db.clarificationQuestions.length).toBe(1);
    expect(db.clarificationQuestions[0].id).toBe('q-01');
  });

  it('rolls back answer persistence atomically if workflow revision comparison fails', async () => {
    db.clarificationQuestions.push({
      id: 'q-02',
      investigationId: INV_ID,
      questionIndex: 0,
      roundIndex: 1,
      questionText: 'What was the expected outcome?',
      isAnswered: false,
    });

    // Stale expectedWorkflowRevision: expected 999 instead of 1
    await expect(
      service.answerClarifications({
        investigationId: INV_ID,
        ownerId: OWNER_ID,
        expectedWorkflowRevision: 999,
        answers: [{ questionId: 'q-02', answerText: 'wb-item-02 should be removed' }],
      })
    ).rejects.toThrow();

    // Verification: Because transaction rolled back, question MUST remain unanswered
    const question = db.clarificationQuestions.find((q) => q.id === 'q-02');
    expect(question?.isAnswered).toBe(false);
    expect(question?.answerText).toBeUndefined();
  });
});
