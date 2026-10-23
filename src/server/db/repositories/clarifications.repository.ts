import { eq, and, asc } from 'drizzle-orm';
import { clarificationQuestionsTable, investigationsTable } from '../schema';
import { getDb, DbClient } from '../index';
import { NotFoundError } from '@/server/workflow/workflow-errors';
import { inferClarificationPurpose } from '@/contracts/clarification';

export type ClarificationQuestionRecord = typeof clarificationQuestionsTable.$inferSelect;
export type TxOrDb = Parameters<Parameters<DbClient['transaction']>[0]>[0] | DbClient;

export class ClarificationsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Persists server-owned clarification questions for an investigation.
   * Enforces concurrency-safe serialization by locking the parent investigation row (FOR UPDATE)
   * within a database transaction, then allocating append-only question indices based on
   * the true persisted maximum questionIndex.
   *
   * Ignores model-local question indices to prevent cross-round collisions.
   */
  async saveQuestions(
    investigationId: string,
    questions: Array<{
      questionText: string;
      questionIndex?: number;
      roundIndex?: number;
      purpose?: string | null;
      explanation?: string | null;
      suggestedOptions?: string[] | null;
    }>,
    options?: {
      roundIndex?: number;
      tx?: TxOrDb;
    }
  ): Promise<ClarificationQuestionRecord[]> {
    if (questions.length === 0) {
      return [];
    }

    const runInTx = async (tx: TxOrDb): Promise<ClarificationQuestionRecord[]> => {
      // 1. Concurrency-safe serialization: lock parent investigation row FOR UPDATE
      if (typeof tx.select === 'function') {
        const invQuery = tx
          .select({ id: investigationsTable.id })
          .from(investigationsTable)
          .where(eq(investigationsTable.id, investigationId));
        if (typeof invQuery.for === 'function') {
          await invQuery.for('update');
        } else {
          await invQuery;
        }
      }

      // 2. Query all existing questions for this investigation to determine true persisted max questionIndex and max roundIndex
      const existing = await tx
        .select({
          questionIndex: clarificationQuestionsTable.questionIndex,
          roundIndex: clarificationQuestionsTable.roundIndex,
        })
        .from(clarificationQuestionsTable)
        .where(eq(clarificationQuestionsTable.investigationId, investigationId));

      let maxIndex = -1;
      let maxRound = 0;
      for (const row of existing) {
        if (typeof row.questionIndex === 'number' && row.questionIndex > maxIndex) {
          maxIndex = row.questionIndex;
        }
        if (typeof row.roundIndex === 'number' && row.roundIndex > maxRound) {
          maxRound = row.roundIndex;
        }
      }

      let nextIndex = maxIndex + 1;
      const targetRound = options?.roundIndex ?? (maxRound === 0 ? 1 : maxRound + 1);

      // 3. Prepare append-only records with server-assigned questionIndex and targetRound
      const recordsToInsert = questions.map((q) => {
        const assignedIdx = nextIndex++;
        return {
          investigationId,
          questionIndex: assignedIdx,
          roundIndex: q.roundIndex ?? targetRound,
          questionText: q.questionText,
          purpose: q.purpose || inferClarificationPurpose(q.questionText, null, q.explanation),
          explanation: q.explanation || null,
          suggestedOptions: q.suggestedOptions || null,
          isAnswered: false,
        };
      });

      // 4. Insert all records inside the locked transaction
      const inserted: ClarificationQuestionRecord[] = [];
      for (const record of recordsToInsert) {
        const [row] = await tx
          .insert(clarificationQuestionsTable)
          .values(record)
          .returning();
        if (row) inserted.push(row);
      }

      return inserted;
    };

    if (options?.tx) {
      return runInTx(options.tx);
    }

    const db = this.dbProvider();
    if (typeof db.transaction === 'function') {
      return db.transaction(async (tx) => runInTx(tx));
    }
    return runInTx(db);
  }

  async listQuestions(investigationId: string): Promise<ClarificationQuestionRecord[]> {
    const db = this.dbProvider();

    const query = db
      .select()
      .from(clarificationQuestionsTable)
      .where(eq(clarificationQuestionsTable.investigationId, investigationId));

    if (typeof query.orderBy === 'function') {
      return query.orderBy(asc(clarificationQuestionsTable.questionIndex));
    }
    return query;
  }

  async getQuestionById(questionId: string, investigationId: string): Promise<ClarificationQuestionRecord | null> {
    const db = this.dbProvider();

    const [row] = await db
      .select()
      .from(clarificationQuestionsTable)
      .where(
        and(
          eq(clarificationQuestionsTable.id, questionId),
          eq(clarificationQuestionsTable.investigationId, investigationId)
        )
      )
      .limit(1);

    return row || null;
  }

  async answerQuestion(
    questionId: string,
    investigationId: string,
    answerText: string,
    answeredBy: string,
    tx?: TxOrDb
  ): Promise<ClarificationQuestionRecord> {
    const executor = tx || this.dbProvider();

    const [updated] = await executor
      .update(clarificationQuestionsTable)
      .set({
        isAnswered: true,
        answerText,
        answeredBy,
        answeredAt: new Date(),
      })
      .where(
        and(
          eq(clarificationQuestionsTable.id, questionId),
          eq(clarificationQuestionsTable.investigationId, investigationId)
        )
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('ClarificationQuestion', questionId);
    }

    return updated;
  }

  async batchAnswerQuestions(
    investigationId: string,
    answers: Array<{ questionId: string; answerText: string }>,
    answeredBy: string
  ): Promise<ClarificationQuestionRecord[]> {
    const db = this.dbProvider();

    const runBatch = async (tx: TxOrDb) => {
      const updated: ClarificationQuestionRecord[] = [];
      for (const a of answers) {
        const row = await this.answerQuestion(a.questionId, investigationId, a.answerText, answeredBy, tx);
        updated.push(row);
      }
      return updated;
    };

    if (typeof db.transaction === 'function') {
      return db.transaction(runBatch);
    }
    return runBatch(db);
  }
}

export const clarificationsRepository = new ClarificationsRepository();
