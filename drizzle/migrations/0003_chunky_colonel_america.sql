CREATE TABLE "diagnostic_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"worker_instance_id" text NOT NULL,
	"status" text NOT NULL,
	"fencing_epoch" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "execution_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"plan_version" integer NOT NULL,
	"plan_hash" text NOT NULL,
	"approval_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'ADMITTED' NOT NULL,
	"fencing_epoch" integer,
	"worker_instance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "global_execution_leases" (
	"slot_name" text PRIMARY KEY NOT NULL,
	"worker_instance_id" text NOT NULL,
	"execution_request_id" uuid,
	"investigation_id" uuid,
	"ownership_epoch" integer DEFAULT 1 NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"singleton_key" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "event_sequence_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_approval_id_plan_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."plan_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD CONSTRAINT "global_execution_leases_execution_request_id_execution_requests_id_fk" FOREIGN KEY ("execution_request_id") REFERENCES "public"."execution_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_execution_leases" ADD CONSTRAINT "global_execution_leases_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diagnostic_runs_job_id_unique_idx" ON "diagnostic_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "execution_requests_investigation_id_idx" ON "execution_requests" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "execution_requests_status_idx" ON "execution_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_messages_status_idx" ON "outbox_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_messages_created_at_idx" ON "outbox_messages" USING btree ("created_at");