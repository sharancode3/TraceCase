ALTER TABLE "clarification_questions" ADD COLUMN IF NOT EXISTS "round_index" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clarification_questions_inv_round_idx" ON "clarification_questions" USING btree ("investigation_id","round_index");
