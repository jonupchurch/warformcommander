CREATE TABLE "current_ruleset" (
	"id" text PRIMARY KEY DEFAULT 'current' NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "current_ruleset_singleton_chk" CHECK ("current_ruleset"."id" = 'current')
);
--> statement-breakpoint
CREATE TABLE "rulesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" jsonb NOT NULL,
	"ruleset_hash" text NOT NULL,
	"editor_id" text,
	"parent_id" uuid,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "current_ruleset" ADD CONSTRAINT "current_ruleset_ruleset_id_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."rulesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_editor_id_user_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_parent_id_rulesets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."rulesets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rulesets_hash_idx" ON "rulesets" USING btree ("ruleset_hash");--> statement-breakpoint
CREATE INDEX "rulesets_created_idx" ON "rulesets" USING btree ("created_at");