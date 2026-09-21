ALTER TYPE "public"."agent" RENAME TO "chat_mode";--> statement-breakpoint
ALTER TABLE "Chat" RENAME COLUMN "agent" TO "chatMode";
