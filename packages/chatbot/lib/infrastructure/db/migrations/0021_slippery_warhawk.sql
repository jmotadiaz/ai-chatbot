CREATE TYPE "public"."agent" AS ENUM('rag', 'web', 'context7');--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "agent" "agent" DEFAULT 'rag' NOT NULL;