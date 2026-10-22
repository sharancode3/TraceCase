ALTER TABLE investigations ALTER COLUMN token_cost_usd TYPE numeric(14,8);
--> statement-breakpoint
ALTER TABLE budget_reservations ALTER COLUMN reserved_usd TYPE numeric(14,8), ALTER COLUMN actual_cost_usd TYPE numeric(14,8);
--> statement-breakpoint
ALTER TABLE synthesis_explanations ALTER COLUMN token_cost_usd TYPE numeric(14,8);
