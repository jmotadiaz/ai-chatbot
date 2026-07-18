ALTER TABLE "Project" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;