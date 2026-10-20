CREATE TABLE "clarification_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"question_text" text NOT NULL,
	"explanation" text,
	"suggested_options" text[],
	"is_answered" boolean DEFAULT false NOT NULL,
	"answer_text" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"principal_id" uuid NOT NULL,
	"key" text NOT NULL,
	"resource_id" text NOT NULL,
	"command_name" text NOT NULL,
	"command_fingerprint" text NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_principal_id_key_pk" PRIMARY KEY("principal_id","key")
);
--> statement-breakpoint
DROP INDEX "investigation_events_inv_seq_idx";--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "workflow_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "review_status" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "rejected_by" text;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "clarification_questions" ADD CONSTRAINT "clarification_questions_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clarification_questions_inv_idx_idx" ON "clarification_questions" USING btree ("investigation_id","question_index");--> statement-breakpoint
CREATE INDEX "clarification_questions_inv_id_idx" ON "clarification_questions" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_resource_idx" ON "idempotency_keys" USING btree ("principal_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_events_inv_seq_unique_idx" ON "investigation_events" USING btree ("investigation_id","sequence_index");