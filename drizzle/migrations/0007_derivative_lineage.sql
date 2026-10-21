ALTER TABLE "evidence_artifacts" ADD COLUMN "raw_artifact_id" uuid;--> statement-breakpoint
CREATE INDEX "evidence_artifacts_raw_artifact_id_idx" ON "evidence_artifacts" USING btree ("raw_artifact_id");
