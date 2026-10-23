import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { ClarificationsRepository } from '@/server/db/repositories/clarifications.repository';
import { InvestigationWorkflowService } from '@/server/workflow/investigation-workflow.service';
import { setCustomVerifierForTesting } from '@/server/auth/jwt';
import { setDbInstanceForTesting, resetDbInstanceForTesting } from '@/server/db';
import { _resetCachedEnvForTesting } from '@/server/config/env';
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

class ClarificationDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];
  public clarificationQuestions: any[] = [];
  public forUpdateCalls: string[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'clarification_questions') return this.clarificationQuestions;
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
      values: (val: any) => {
        const now = new Date();
        const row = {
          ...val,
          id: val.id || crypto.randomUUID(),
          createdAt: val.createdAt || now,
          updatedAt: val.updatedAt || now,
        };

        const tableName = getTableName(table);

        // Enforce the unique index on clarification_questions (investigationId, questionIndex)
        if (tableName === 'clarification_questions') {
          const duplicate = this.clarificationQuestions.find(
            (q) => q.investigationId === row.investigationId && q.questionIndex === row.questionIndex
          );
          if (duplicate) {
            return {
              returning: () => {
                const err: any = new Error(
                  `duplicate key value violates unique constraint "clarification_questions_inv_idx_idx" (Key (investigation_id, question_index)=(${row.investigationId}, ${row.questionIndex}) already exists)`
                );
                err.code = '23505';
                return Promise.reject(err);
              },
              then: (_resolve: any, reject: any) => {
                const err: any = new Error(
                  `duplicate key value violates unique constraint "clarification_questions_inv_idx_idx" (Key (investigation_id, question_index)=(${row.investigationId}, ${row.questionIndex}) already exists)`
                );
                err.code = '23505';
                return Promise.reject(err).catch(reject);
              },
            };
          }
          this.clarificationQuestions.push(row);
        } else if (tableName === 'investigations') {
          this.investigations.push(row);
        } else if (tableName === 'bug_reports') {
          this.bugReports.push(row);
        } else if (tableName === 'targets') {
          this.targets.push(row);
        } else if (tableName === 'principals') {
          this.principals.push(row);
        }

        return {
          returning: () => Promise.resolve([row]),
          then: (resolve: any, reject: any) => Promise.resolve([row]).then(resolve, reject),
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

  async transaction(cb: (tx: this) => Promise<any>) {
    // Snapshot state for atomic rollback simulation
    const snapshot = {
      principals: [...this.principals],
      targets: [...this.targets],
      bugReports: [...this.bugReports],
      investigations: [...this.investigations],
      clarificationQuestions: [...this.clarificationQuestions],
    };

    try {
      return await cb(this);
    } catch (err) {
      this.principals = snapshot.principals;
      this.targets = snapshot.targets;
      this.bugReports = snapshot.bugReports;
      this.investigations = snapshot.investigations;
      this.clarificationQuestions = snapshot.clarificationQuestions;
      throw err;
    }
  }
}

describe('Phase F: Concurrency-Safe Clarification Ordering and Persistence', () => {
  let dbMock: ClarificationDbMock;
  let repo: ClarificationsRepository;
  let workflowService: InvestigationWorkflowService;

  const OWNER_ID = '00000000-0000-0000-0000-000000000001';
  const TARGET_ID = '11111111-1111-1111-1111-111111111111';
  const INVESTIGATION_ID = '22222222-2222-2222-2222-222222222222';
  const REPORT_ID = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    _resetCachedEnvForTesting();
    dbMock = new ClarificationDbMock();
    setDbInstanceForTesting(dbMock as any);
    repo = new ClarificationsRepository(() => dbMock as any);
    workflowService = new InvestigationWorkflowService(() => dbMock as any);

    // Setup base investigation records
    dbMock.principals.push({
      id: OWNER_ID,
      role: 'human_operator',
      displayName: 'Test Operator',
      status: 'active',
      isServiceAccount: false,
    });

    dbMock.targets.push({
      id: TARGET_ID,
      ownerId: OWNER_ID,
      name: 'Staging Target',
      baseUrl: 'http://localhost:3005',
      environment: 'staging',
      allowedOrigins: ['http://localhost:3005'],
    });

    dbMock.bugReports.push({
      id: REPORT_ID,
      ownerId: OWNER_ID,
      targetId: TARGET_ID,
      title: 'Filter issue on tasks',
      bugDescription: 'Filter active shows nothing',
      rawDescription: 'Filter active shows nothing',
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

  describe('1. Deterministic Regression: Multi-round model index collision', () => {
    it('appends second-round questions starting at 0 without colliding with prior round', async () => {
      // Round 1: Model proposes 2 questions with local indices 0, 1
      const round1Questions = [
        { questionText: 'What browser was used?', questionIndex: 0 },
        { questionText: 'Which user role was active?', questionIndex: 1 },
      ];

      const insertedRound1 = await repo.saveQuestions(INVESTIGATION_ID, round1Questions);
      expect(insertedRound1.length).toBe(2);
      expect(insertedRound1[0].questionIndex).toBe(0);
      expect(insertedRound1[0].roundIndex).toBe(1);
      expect(insertedRound1[1].questionIndex).toBe(1);
      expect(insertedRound1[1].roundIndex).toBe(1);

      // Answer Round 1 questions
      await repo.answerQuestion(insertedRound1[0].id, INVESTIGATION_ID, 'Chrome 130', OWNER_ID);
      await repo.answerQuestion(insertedRound1[1].id, INVESTIGATION_ID, 'Admin User', OWNER_ID);

      // Round 2: Model proposes another 2 questions with local indices 0, 1 (restarting at 0)
      const round2Questions = [
        { questionText: 'Did you reload before deleting?', questionIndex: 0 },
        { questionText: 'Was any network error displayed in console?', questionIndex: 1 },
      ];

      // In the old code, this caused: duplicate key value violates unique constraint "clarification_questions_inv_idx_idx"
      // In the repaired code, server assigns append-only indices: 2, 3
      const insertedRound2 = await repo.saveQuestions(INVESTIGATION_ID, round2Questions);
      expect(insertedRound2.length).toBe(2);
      expect(insertedRound2[0].questionIndex).toBe(2);
      expect(insertedRound2[0].roundIndex).toBe(2);
      expect(insertedRound2[1].questionIndex).toBe(3);
      expect(insertedRound2[1].roundIndex).toBe(2);

      // Verify all 4 questions exist with correct indices and prior answers intact
      const allQuestions = await repo.listQuestions(INVESTIGATION_ID);
      expect(allQuestions.length).toBe(4);
      expect(allQuestions.map((q) => q.questionIndex)).toEqual([0, 1, 2, 3]);

      // Round 1 answers must be preserved
      expect(allQuestions[0].isAnswered).toBe(true);
      expect(allQuestions[0].answerText).toBe('Chrome 130');
      expect(allQuestions[1].isAnswered).toBe(true);
      expect(allQuestions[1].answerText).toBe('Admin User');

      // Round 2 questions remain unanswered
      expect(allQuestions[2].isAnswered).toBe(false);
      expect(allQuestions[3].isAnswered).toBe(false);
    });

    it('serializes allocation by locking parent investigation row FOR UPDATE', async () => {
      const questions = [{ questionText: 'Sample clarification question?' }];
      await repo.saveQuestions(INVESTIGATION_ID, questions);

      // Verify that FOR UPDATE was requested on investigations table
      expect(dbMock.forUpdateCalls).toContain('update');
    });
  });

  describe('2. Replay protection and workflow integration', () => {
    it('returns existing pending clarification questions on retry without duplicating rows', async () => {
      // Mock planner returning CLARIFICATION_NEEDED
      const mockPlanner: ReportClarificationAgentPort = {
        generateProposal: vi.fn().mockResolvedValue({
          status: 'CLARIFICATION_NEEDED',
          questions: [
            { questionText: 'Is the target behind a VPN?', options: ['Yes', 'No'] },
          ],
        }),
      };

      // First planning request: transitions to CLARIFICATION_PENDING and creates 1 question
      const result1 = await workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: mockPlanner,
      });

      expect(result1.status).toBe('CLARIFICATION_NEEDED');
      if (result1.status === 'CLARIFICATION_NEEDED') {
        expect(result1.questions.length).toBe(1);
        expect(result1.questions[0].questionIndex).toBe(0);
      }
      expect(mockPlanner.generateProposal).toHaveBeenCalledTimes(1);
      expect(dbMock.clarificationQuestions.length).toBe(1);

      // Second planning request while CLARIFICATION_PENDING with unanswered questions:
      // Must replay existing questions without calling model or appending duplicate rows
      const result2 = await workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: mockPlanner,
      });

      expect(result2.status).toBe('CLARIFICATION_NEEDED');
      if (result2.status === 'CLARIFICATION_NEEDED') {
        expect(result2.questions.length).toBe(1);
        expect(result2.questions[0].id).toBe(dbMock.clarificationQuestions[0].id);
      }

      // Model must NOT be called again
      expect(mockPlanner.generateProposal).toHaveBeenCalledTimes(1);

      // Database rows must not have duplicated
      expect(dbMock.clarificationQuestions.length).toBe(1);
    });

    it('advances to genuine new round when all previous questions are answered', async () => {
      let callCount = 0;
      const mockPlanner: ReportClarificationAgentPort = {
        generateProposal: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              status: 'CLARIFICATION_NEEDED',
              questions: [{ questionText: 'Round 1 question?' }],
            });
          }
          return Promise.resolve({
            status: 'CLARIFICATION_NEEDED',
            questions: [{ questionText: 'Round 2 question?' }],
          });
        }),
      };

      // Round 1
      const res1 = await workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: mockPlanner,
      });
      expect(res1.status).toBe('CLARIFICATION_NEEDED');
      const q1Id = dbMock.clarificationQuestions[0].id;

      // Answer Round 1
      await workflowService.answerClarifications({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        answers: [{ questionId: q1Id, answerText: 'Answer 1' }],
      });

      // Round 2: now all previous questions are answered, genuine new round proceeds
      const res2 = await workflowService.requestPlanning({
        investigationId: INVESTIGATION_ID,
        ownerId: OWNER_ID,
        plannerPort: mockPlanner,
      });

      expect(res2.status).toBe('CLARIFICATION_NEEDED');
      expect(callCount).toBe(2);

      const all = await repo.listQuestions(INVESTIGATION_ID);
      expect(all.length).toBe(2);
      expect(all[0].questionIndex).toBe(0);
      expect(all[0].roundIndex).toBe(1);
      expect(all[1].questionIndex).toBe(1);
      expect(all[1].roundIndex).toBe(2);
    });
  });

  describe('3. Transaction rollback on partial failures', () => {
    it('rolls back completely if any question insertion in a round fails', async () => {
      // Pre-populate with 1 question at index 0
      dbMock.clarificationQuestions.push({
        id: 'existing-q',
        investigationId: INVESTIGATION_ID,
        questionIndex: 0,
        roundIndex: 1,
        questionText: 'Existing Q',
        isAnswered: true,
      });

      // Attempt to save 2 questions where an internal error is triggered
      const originalInsert = dbMock.insert.bind(dbMock);
      let callNum = 0;
      dbMock.insert = ((table: any) => {
        callNum++;
        if (callNum === 2) {
          return {
            values: () => ({
              returning: () => Promise.reject(new Error('Simulated database write error on second question')),
              then: (_resolve: any, reject: any) => Promise.reject(new Error('Simulated database write error on second question')).catch(reject),
            }),
          };
        }
        return originalInsert(table);
      }) as any;

      await expect(
        repo.saveQuestions(INVESTIGATION_ID, [
          { questionText: 'First new question' },
          { questionText: 'Second new question' },
        ])
      ).rejects.toThrow('Simulated database write error');

      // Due to transaction rollback, the first new question must NOT remain
      const questionsAfterRollback = dbMock.clarificationQuestions.filter(
        (q) => q.investigationId === INVESTIGATION_ID
      );
      expect(questionsAfterRollback.length).toBe(1);
      expect(questionsAfterRollback[0].id).toBe('existing-q');
    });
  });

  describe('4. Cross-investigation ordering independence', () => {
    it('maintains independent question sequences for different investigations', async () => {
      const OTHER_INV_ID = '99999999-9999-9999-9999-999999999999';

      dbMock.investigations.push({
        id: OTHER_INV_ID,
        ownerId: OWNER_ID,
        targetId: TARGET_ID,
        reportId: REPORT_ID,
        lifecycleStatus: 'ACTIVE',
        reviewStatus: 'DRAFT',
        workflowRevision: 1,
      });

      const inv1Questions = await repo.saveQuestions(INVESTIGATION_ID, [
        { questionText: 'Inv 1 Q1' },
        { questionText: 'Inv 1 Q2' },
      ]);

      const inv2Questions = await repo.saveQuestions(OTHER_INV_ID, [
        { questionText: 'Inv 2 Q1' },
        { questionText: 'Inv 2 Q2' },
      ]);

      // Both investigations start questionIndex at 0 independently
      expect(inv1Questions.map((q) => q.questionIndex)).toEqual([0, 1]);
      expect(inv2Questions.map((q) => q.questionIndex)).toEqual([0, 1]);
    });
  });
});
