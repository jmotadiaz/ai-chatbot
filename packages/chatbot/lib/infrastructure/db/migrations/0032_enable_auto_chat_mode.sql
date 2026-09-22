-- Add 'auto' to the chat_mode enum and make it the default for new chats.
--
-- The enum is recreated instead of using ALTER TYPE ... ADD VALUE because the
-- new value cannot be referenced (SET DEFAULT 'auto') in the same transaction
-- that added it, and Drizzle's migrator applies every pending migration inside
-- a single transaction. Same pattern as 0024_lame_gorilla_man.sql.
ALTER TABLE "Chat" ALTER COLUMN "chatMode" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "chatMode" SET DEFAULT 'auto'::text;--> statement-breakpoint
DROP TYPE "public"."chat_mode";--> statement-breakpoint
CREATE TYPE "public"."chat_mode" AS ENUM('auto', 'context7', 'rag', 'web');--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "chatMode" SET DEFAULT 'auto'::"public"."chat_mode";--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "chatMode" SET DATA TYPE "public"."chat_mode" USING "chatMode"::"public"."chat_mode";
