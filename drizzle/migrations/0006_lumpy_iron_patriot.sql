CREATE TABLE "budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"ticket_id" text NOT NULL,
	"reserved_usd" numeric(8, 4) NOT NULL,
	"status" text DEFAULT 'RESERVED' NOT NULL,
	"actual_cost_usd" numeric(8, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "budget_reservations_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"active_jobs" integer DEFAULT 0 NOT NULL,
	"hostname" text,
	"pid" integer,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investigation_attempts" ADD COLUMN "actions_executed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "investigation_attempts" ADD COLUMN "mutation_state" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "investigation_attempts" ADD COLUMN "last_observed_step" text;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_reservations_inv_idx" ON "budget_reservations" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "budget_reservations_status_idx" ON "budget_reservations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_reservations_ticket_idx" ON "budget_reservations" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "worker_heartbeats_last_heartbeat_idx" ON "worker_heartbeats" USING btree ("last_heartbeat_at");