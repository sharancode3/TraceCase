CREATE TABLE "assertion_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"attempt_id" uuid,
	"attempt_number" integer NOT NULL,
	"assertion_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"result" text NOT NULL,
	"expected_value" text,
	"observed_value" text,
	"details" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"validity" text DEFAULT 'PENDING' NOT NULL,
	"finding" text DEFAULT 'UNRESOLVED' NOT NULL,
	"invalidity_reason" text,
	"total_duration_ms" integer,
	"completed_cleanly" boolean DEFAULT false,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "pair_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"valid_attempt_count" integer NOT NULL,
	"matching_attempt_count" integer NOT NULL,
	"is_comparable" boolean NOT NULL,
	"summary" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reset_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 2 NOT NULL,
	"transport_success" boolean NOT NULL,
	"baseline_equivalent" boolean NOT NULL,
	"is_verified_restored" boolean NOT NULL,
	"expected_state_hash" text,
	"observed_state_hash" text,
	"discrepancies" jsonb,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD COLUMN "is_quarantined" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD COLUMN "quarantine_reason" text;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD COLUMN "quarantined_by_worker" text;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD COLUMN "quarantine_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD COLUMN "quarantine_cleared_by" text;--> statement-breakpoint
ALTER TABLE "assertion_evaluations" ADD CONSTRAINT "assertion_evaluations_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertion_evaluations" ADD CONSTRAINT "assertion_evaluations_attempt_id_investigation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."investigation_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_attempts" ADD CONSTRAINT "investigation_attempts_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_assessments" ADD CONSTRAINT "pair_assessments_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reset_receipts" ADD CONSTRAINT "reset_receipts_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reset_receipts" ADD CONSTRAINT "reset_receipts_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assertion_evaluations_investigation_id_idx" ON "assertion_evaluations" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "assertion_evaluations_attempt_id_idx" ON "assertion_evaluations" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "investigation_attempts_investigation_id_idx" ON "investigation_attempts" USING btree ("investigation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_attempts_unique_idx" ON "investigation_attempts" USING btree ("investigation_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "pair_assessments_investigation_id_unique_idx" ON "pair_assessments" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "reset_receipts_investigation_id_idx" ON "reset_receipts" USING btree ("investigation_id");