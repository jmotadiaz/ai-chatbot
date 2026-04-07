CREATE TYPE "public"."memory_category" AS ENUM('personal', 'professional', 'preferences');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('extracted', 'explicit');--> statement-breakpoint
CREATE TABLE "UserMemory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"category" "memory_category" NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"source" "memory_source" DEFAULT 'extracted' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "userMemoryEmbeddingIndex" ON "UserMemory" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "userMemoryCategoryIndex" ON "UserMemory" USING btree ("userId","category");