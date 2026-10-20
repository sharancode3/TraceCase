CREATE TABLE "bug_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"title" text NOT NULL,
	"bug_description" text NOT NULL,
	"expected_behavior" text NOT NULL,
	"observed_behavior" text NOT NULL,
	"suspected_steps" text[],
	"browser_environment" text,
	"build_version" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"sequence_index" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"emitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"lifecycle_status" text DEFAULT 'DRAFT' NOT NULL,
	"reproduction_verdict" text DEFAULT 'PENDING' NOT NULL,
	"evidence_readiness" text DEFAULT 'PENDING_GENERATION' NOT NULL,
	"plan_version" integer,
	"plan_hash" text,
	"active_attempt_number" integer,
	"token_cost_usd" numeric(8, 4) DEFAULT '0.0000' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"plan_version" integer NOT NULL,
	"plan_hash" text NOT NULL,
	"approved_by" text NOT NULL,
	"operator_notes" text,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_locks" (
	"target_id" uuid PRIMARY KEY NOT NULL,
	"investigation_id" uuid NOT NULL,
	"worker_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"allowed_origins" text[] NOT NULL,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"test_account_ref" text,
	"fixture_reset_endpoint" text,
	"environment" text DEFAULT 'staging' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_events" ADD CONSTRAINT "investigation_events_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_report_id_bug_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."bug_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD CONSTRAINT "plan_approvals_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_locks" ADD CONSTRAINT "target_locks_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_locks" ADD CONSTRAINT "target_locks_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;