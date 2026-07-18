ALTER TABLE "Chat" ALTER COLUMN "agent" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "agent" SET DEFAULT 'context7'::text;--> statement-breakpoint
DROP TYPE "public"."agent";--> statement-breakpoint
CREATE TYPE "public"."agent" AS ENUM('context7', 'rag', 'web');--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "agent" SET DEFAULT 'context7'::"public"."agent";--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "agent" SET DATA TYPE "public"."agent" USING "agent"::"public"."agent";