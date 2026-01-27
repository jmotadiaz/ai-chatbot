CREATE TABLE "ProjectResource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"resourceId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Resource" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ProjectResource" ADD CONSTRAINT "ProjectResource_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ProjectResource" ADD CONSTRAINT "ProjectResource_resourceId_Resource_id_fk" FOREIGN KEY ("resourceId") REFERENCES "public"."Resource"("id") ON DELETE cascade ON UPDATE no action;