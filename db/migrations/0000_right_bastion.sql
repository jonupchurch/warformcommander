CREATE TYPE "public"."adaptation" AS ENUM('locked', 'free');--> statement-breakpoint
CREATE TYPE "public"."match_mode" AS ENUM('ranked', 'practice');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('editorial', 'balance', 'devlog', 'changelog');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('player', 'admin');--> statement-breakpoint
CREATE TYPE "public"."winner_side" AS ENUM('attacker', 'defender');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "defense_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_squad_id" uuid,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"schema_version" smallint DEFAULT 1 NOT NULL,
	"power_rating" integer NOT NULL,
	"defense_slot" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp,
	CONSTRAINT "defsnap_slot_chk" CHECK ("defense_snapshots"."defense_slot" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "ladder_standings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"attack_wins" integer DEFAULT 0 NOT NULL,
	"attack_losses" integer DEFAULT 0 NOT NULL,
	"defense_wins" integer DEFAULT 0 NOT NULL,
	"defense_losses" integer DEFAULT 0 NOT NULL,
	"net_victories" integer GENERATED ALWAYS AS ("ladder_standings"."attack_wins" - "ladder_standings"."defense_losses") STORED,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"total_damage" bigint DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "match_mode" NOT NULL,
	"attacker_user_id" text,
	"defender_user_id" text,
	"attacker_squad_id" uuid,
	"defender_snapshot_id" uuid,
	"adaptation" "adaptation" NOT NULL,
	"winner_side" "winner_side" NOT NULL,
	"attacker_games_won" smallint NOT NULL,
	"defender_games_won" smallint NOT NULL,
	"attacker_damage" integer DEFAULT 0 NOT NULL,
	"defender_damage" integer DEFAULT 0 NOT NULL,
	"duration_ticks" integer,
	"seed" numeric(20, 0) NOT NULL,
	"ruleset_hash" text NOT NULL,
	"format_version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" text NOT NULL,
	"type" "post_type" NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"metadata" jsonb,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"machine_type_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"schema_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"replay" jsonb NOT NULL,
	"seed" numeric(20, 0) NOT NULL,
	"ruleset_hash" text NOT NULL,
	"format_version" integer NOT NULL,
	"winner_side" "winner_side" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "replays_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slot_index" smallint NOT NULL,
	"config" jsonb NOT NULL,
	"schema_version" smallint DEFAULT 1 NOT NULL,
	"power_rating" integer NOT NULL,
	"defense_slot" smallint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "squads_defense_slot_chk" CHECK ("squads"."defense_slot" is null or ("squads"."defense_slot" between 0 and 2))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"handle" text,
	"role" "role" DEFAULT 'player' NOT NULL,
	"isBot" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defense_snapshots" ADD CONSTRAINT "defense_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defense_snapshots" ADD CONSTRAINT "defense_snapshots_source_squad_id_squads_id_fk" FOREIGN KEY ("source_squad_id") REFERENCES "public"."squads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ladder_standings" ADD CONSTRAINT "ladder_standings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_attacker_user_id_user_id_fk" FOREIGN KEY ("attacker_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_defender_user_id_user_id_fk" FOREIGN KEY ("defender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_attacker_squad_id_squads_id_fk" FOREIGN KEY ("attacker_squad_id") REFERENCES "public"."squads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_defender_snapshot_id_defense_snapshots_id_fk" FOREIGN KEY ("defender_snapshot_id") REFERENCES "public"."defense_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "defsnap_user_slot_active_uq" ON "defense_snapshots" USING btree ("user_id","defense_slot") WHERE "defense_snapshots"."active";--> statement-breakpoint
CREATE INDEX "defsnap_user_active_idx" ON "defense_snapshots" USING btree ("user_id") WHERE "defense_snapshots"."active";--> statement-breakpoint
CREATE INDEX "standings_net_idx" ON "ladder_standings" USING btree ("net_victories");--> statement-breakpoint
CREATE INDEX "matches_attacker_idx" ON "matches" USING btree ("attacker_user_id");--> statement-breakpoint
CREATE INDEX "matches_defender_idx" ON "matches" USING btree ("defender_user_id");--> statement-breakpoint
CREATE INDEX "matches_mode_time_idx" ON "matches" USING btree ("mode","created_at");--> statement-breakpoint
CREATE INDEX "matches_snapshot_idx" ON "matches" USING btree ("defender_snapshot_id");--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "posts_type_idx" ON "posts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "presets_user_type_idx" ON "presets" USING btree ("user_id","machine_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squads_user_slot_uq" ON "squads" USING btree ("user_id","slot_index");--> statement-breakpoint
CREATE UNIQUE INDEX "squads_user_defenseslot_uq" ON "squads" USING btree ("user_id","defense_slot") WHERE "squads"."defense_slot" is not null;--> statement-breakpoint
CREATE INDEX "squads_user_idx" ON "squads" USING btree ("user_id");