import { eq, and } from 'drizzle-orm';
import { clarificationQuestionsTable } from '../schema';
import { getDb, DbClient } from '../index';

export type ClarificationQuestionRecord = typeof clarificationQuestionsTable.$inferSelect;

export class ClarificationsRepository {
  constructor(private dbProvider: () => DbClient = getDb) {}

  /**
   * Persists server-owned clarification questions for an investigation.
   * Assigns sequential questionIndex and generates authoritative UUIDs.
   */
  async saveQuestions(
    investigationId: string,
    questions: Array<{
      questionText: string;
      questionIndex?: number;
      explanation?: string | null;
      suggestedOptions?: string[] | null;
    }>
  ): Promise<ClarificationQuestionRecord[]> {
    const db = this.dbProvider();

    // Query existing questions count to determine indexing
    const existing = await db
      .select()
      .from(clarificationQuestionsTable)
      .where(eq(clarificationQuestionsTable.investigationId, investigationId));

    let nextIndex = existing.length;
    const recordsToInsert = questions.map((q) => {
      const idx = q.questionIndex !== undefined ? q.questionIndex : nextIndex++;
      return {
        investigationId,
        questionIndex: idx,
        questionText: q.questionText,
        explanation: q.explanation || null,
        suggestedOptions: q.suggestedOptions || null,
        isAnswered: false,
      };
    });

    const inserted: ClarificationQuestionRecord[] = [];
    for (const record of recordsToInsert) {
      const [row] = await db
        .insert(clarificationQuestionsTable)
        .values(record)
        .returning();
      if (row) inserted.push(row);
    }

    return inserted;
  }

  async listQuestions(investigationId: string): Promise<ClarificationQuestionRecord[]> {
    const db = this.dbProvider();

    return db
      .select()
      .from(clarificationQuestionsTable)
      .where(eq(clarificationQuestionsTable.investigationId, investigationId));
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
    answeredBy: string
  ): Promise<ClarificationQuestionRecord> {
    const db = this.dbProvider();

    const [updated] = await db
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
      throw new Error(`Clarification question ${questionId} not found in investigation ${investigationId}.`);
    }

    return updated;
  }

  async batchAnswerQuestions(
    investigationId: string,
    answers: Array<{ questionId: string; answerText: string }>,
    answeredBy: string
  ): Promise<ClarificationQuestionRecord[]> {
    const updated: ClarificationQuestionRecord[] = [];
    for (const a of answers) {
      const row = await this.answerQuestion(a.questionId, investigationId, a.answerText, answeredBy);
      updated.push(row);
    }
    return updated;
  }
}

export const clarificationsRepository = new ClarificationsRepository();
