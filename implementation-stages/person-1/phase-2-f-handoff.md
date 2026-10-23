# Person 1 — Phase 2-F Handoff: Concurrency-Safe Clarification Ordering and Persistence

**Stage:** Phase 2 Stage F (`P1-2.3 (part 1) / Phase F: Concurrency-safe clarification ordering and persistence`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Problem Resolved

**Goal:** Multiple clarification rounds and concurrent retries cannot collide or lose history.

### The Defect
Previously, `clarification_questions` rows were subjected to a unique composite index:
```sql
UNIQUE (investigation_id, question_index)
```
When Luna (Role 1) generated questions across multiple rounds, the model returned 0-indexed local arrays (`[0, 1]`). In `src/server/workflow/investigation-workflow.service.ts` and `src/server/db/repositories/clarifications.repository.ts`, the incoming `questionIndex` from the model was passed directly or derived without serialization. When a second planning round occurred after answers were submitted, the model generated questions with indices `0, 1` again, directly colliding with Round 1's persisted questions (`question_index: 0, 1`) and triggering PostgreSQL unique constraint violation errors (`clarification_questions_inv_idx_idx`). Furthermore, concurrent requests or retries without a row-level transaction lock risked allocating duplicate sequence numbers.

### The Fix
1. **Server-Assigned Append-Only Ordering:** The server no longer trusts or assigns Luna's model-local indices as the database-wide sequence number.
2. **PostgreSQL/Drizzle Row Lock Serialization:** Within a single database transaction, `saveQuestions` explicitly acquires an exclusive row lock on the parent investigation (`SELECT id FROM investigations WHERE id = $1 FOR UPDATE`). Under this lock, it computes `MAX(question_index)` and allocates strictly monotonic, append-only indices (`maxIndex + 1`, `maxIndex + 2`, ...).
3. **Additive Round Tracking:** Added `round_index` to `clarification_questions` (default `1`) and a composite index on `(investigation_id, round_index)`. Forward-compatible migration `0009_clarification_round_index.sql` preserves all existing data and default behavior without table rewrites or data loss.
4. **Preservation of History & Answers:** Never truncates history, never deletes questions, never destructively renumbers records, and strictly retains the `clarification_questions_inv_idx_idx` uniqueness guarantee.
5. **Authoritative Replay Protection:** Replaying `requestPlanning` on an investigation that is already in `CLARIFICATION_PENDING` with unanswered questions returns the pending clarification round without generating duplicate questions or calling the model. A genuine second round is only requested once all prior round questions have persisted answers.

---

## 2. Implementation Details

### A. Database Schema & Migration (`src/server/db/schema.ts` & `drizzle/migrations/`)
- Updated `clarificationQuestionsTable`:
  - Added `roundIndex: integer('round_index').notNull().default(1)`.
  - Added composite index `clarification_questions_inv_round_idx` on `(investigation_id, round_index)`.
  - Preserved `uniqueIndex('clarification_questions_inv_idx_idx').on(table.investigationId, table.questionIndex)`.
- Created forward-compatible migration `drizzle/migrations/0009_clarification_round_index.sql`:
  ```sql
  ALTER TABLE "clarification_questions" ADD COLUMN IF NOT EXISTS "round_index" integer DEFAULT 1 NOT NULL;
  CREATE INDEX IF NOT EXISTS "clarification_questions_inv_round_idx" ON "clarification_questions" USING btree ("investigation_id","round_index");
  ```
- Registered journal entry in `drizzle/migrations/meta/_journal.json`.

### B. Clarification Contracts (`src/contracts/clarification.ts`)
- Added optional `roundIndex: z.number().int().positive().default(1).optional()` to `ClarificationQuestionSchema`.

### C. Concurrency-Safe Clarifications Repository (`src/server/db/repositories/clarifications.repository.ts`)
- Refactored `saveQuestions`:
  - Encloses allocation and insertions within a single database transaction (`db.transaction`).
  - Serializes allocation using `investigationsTable` row lock:
    ```ts
    await tx
      .select({ id: investigationsTable.id })
      .from(investigationsTable)
      .where(eq(investigationsTable.id, investigationId))
      .for('update');
    ```
  - Calculates `maxIndex` and `maxRound` dynamically from the locked database state.
  - Automatically derives the round index (`maxRound + 1`) if not explicitly specified.
  - Generates sequential, strictly ascending `questionIndex` values starting at `maxIndex + 1`.
  - Atomic bulk insertion guarantees rollback on any failure.
- Updated `listQuestions`:
  - Orders by `asc(clarificationQuestionsTable.questionIndex)` to ensure deterministic display order across rounds.
- Updated `batchAnswerQuestions`:
  - Executes updates atomically within a database transaction, verifying question existence and association before updating answers.

### D. Workflow Service Replay & Progression (`src/server/workflow/investigation-workflow.service.ts`)
- **Authoritative Replay Detection:**
  - Before invoking the planner, `requestPlanning` checks if the investigation is `CLARIFICATION_PENDING`.
  - If pending questions exist with unanswered items, it returns `CLARIFICATION_NEEDED` with the existing questions immediately.
  - Does not re-prompt Luna, does not re-insert rows, and preserves the current `workflowRevision`.
- **Grounded Round Progression:**
  - When all prior questions are answered, `requestPlanning` calls Luna with the accumulated fact ledger.
  - Model questions are passed to `saveQuestions` without model-local indices, allowing the server repository to assign `question_index: 2, 3...` and `round_index: 2`.

---

## 3. Verification Report

### A. Implemented
- Deterministic regression verifying that a second round with model-local indices restarting at zero appends sequentially without violating `uniqueIndex('clarification_questions_inv_idx_idx')`.
- Server-assigned append-only index allocation protected by parent row lock (`FOR UPDATE`).
- Replay deduplication based on durable workflow state and unanswered question presence.
- Additive schema migration with `round_index` column and index.
- Full transactional rollback test proving partial round failure leaves no orphan rows.
- Multi-investigation isolation test ensuring parallel sequences remain independent.

### B. Verified
- **Vitest Test Suite:**
  - `tests/person-1/phase-2/clarification-ordering-and-concurrency.test.ts` (6/6 tests passed):
    - `should append questions sequentially when second round model indices restart at zero`: Passed.
    - `should acquire parent row lock (FOR UPDATE) inside transaction for concurrency safety`: Passed.
    - `should not re-append questions on duplicate replay of requestPlanning for pending clarification`: Passed.
    - `should advance round_index and append questions when previous round is fully answered`: Passed.
    - `should rollback completely if a transaction fails during question insertion`: Passed.
    - `should allocate indices independently across different investigations`: Passed.
  - `tests/person-1/phase-2/` full suite: 65/65 tests passed across 9 test files.
- **Static Quality Gates:**
  - `npm run typecheck` (`tsc --noEmit`): Passed with 0 errors.
  - `npm run lint` (`next lint`): Passed with 0 warnings or errors.

### C. Blocked
- **Real Database Concurrency Verification:** Blocked. Disposable PostgreSQL daemon (Docker / local pg daemon) is not running/available in this test environment (`docker ps` returned daemon unavailable). Real PostgreSQL multi-connection lock contention cannot be executed without a live disposable database; mock transactions verify code-path execution and `FOR UPDATE` query generation, but real locking verification is explicitly marked blocked rather than claiming mock equivalence.
- **Browser Verification:** Browser verification not run, per instruction.

---

## 4. Boundaries and Constraints Respected

- **No Browser Tests / Browser Subagent:** Preserved. Browser verification not run, per instruction.
- **No Paid Model Invocations:** Zero paid OpenAI Luna calls made; deterministic mocks used for all tests.
- **No Git Commits or Branch Switches:** All changes remain local and unstaged on active branch `testingupdate`.
- **No Demo Target Modifications:** `demo-target` code and data left completely untouched.
- **Preserved Existing Records & Uniqueness:** Did not remove `uniqueIndex('clarification_questions_inv_idx_idx')`, did not renumber existing records, and did not delete or truncate tables.
