CREATE TABLE "evidence_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"attempt_number" integer,
	"kind" text NOT NULL,
	"storage_tier" text DEFAULT 'RESTRICTED_RAW' NOT NULL,
	"local_path" text,
	"storage_ref" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"sha256_checksum" text NOT NULL,
	"redaction_applied" boolean DEFAULT false NOT NULL,
	"is_eligible_for_sharing" boolean DEFAULT false NOT NULL,
	"quarantine_reason" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthesis_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"natural_language_summary" text NOT NULL,
	"verified_facts_explanation" text NOT NULL,
	"observations_vs_hypotheses" jsonb,
	"evidence_references" jsonb,
	"limitations_and_gaps" jsonb,
	"token_cost_usd" numeric(8, 4) DEFAULT '0.0000' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthesis_explanations" ADD CONSTRAINT "synthesis_explanations_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_artifacts_investigation_id_idx" ON "evidence_artifacts" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_kind_idx" ON "evidence_artifacts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_storage_tier_idx" ON "evidence_artifacts" USING btree ("storage_tier");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_explanations_inv_unique_idx" ON "synthesis_explanations" USING btree ("investigation_id");