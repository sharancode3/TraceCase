CREATE TABLE "experiment_plan_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"plan_hash" text NOT NULL,
	"plan_payload" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_issuer" text NOT NULL,
	"external_subject" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bug_reports" ALTER COLUMN "expected_behavior" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bug_reports" ALTER COLUMN "observed_behavior" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "raw_description" text;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD COLUMN "authorized_actor_id" text;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD COLUMN "max_action_tier_permitted" text DEFAULT 'TIER_3_MUTATING_INTERACTION' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "is_sandbox_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "fixture_reset_auth_secret_ref" text;--> statement-breakpoint
ALTER TABLE "experiment_plan_revisions" ADD CONSTRAINT "experiment_plan_revisions_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_plan_revisions_inv_ver_idx" ON "experiment_plan_revisions" USING btree ("investigation_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "principals_issuer_subject_idx" ON "principals" USING btree ("external_issuer","external_subject");--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD CONSTRAINT "plan_approvals_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_reports_owner_id_idx" ON "bug_reports" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "bug_reports_target_id_idx" ON "bug_reports" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "investigation_events_inv_seq_idx" ON "investigation_events" USING btree ("investigation_id","sequence_index");--> statement-breakpoint
CREATE INDEX "investigations_owner_id_idx" ON "investigations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "investigations_target_id_idx" ON "investigations" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "investigations_report_id_idx" ON "investigations" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "plan_approvals_inv_ver_idx" ON "plan_approvals" USING btree ("investigation_id","plan_version");--> statement-breakpoint
CREATE INDEX "targets_owner_id_idx" ON "targets" USING btree ("owner_id");