ALTER TABLE "Chat" ADD COLUMN "defaultTemperature" real;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "defaultTopP" real;--> statement-breakpoint
ALTER TABLE "Project" DROP COLUMN "defaultTopK";