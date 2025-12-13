ALTER TABLE "Project" ALTER COLUMN "tools" SET DATA TYPE varchar(100)[];--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "defaultTopK" real;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "tools" varchar(100)[];--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "defaultTopK" real;--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "hasMetaPrompt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Project" DROP COLUMN "metaPrompt";