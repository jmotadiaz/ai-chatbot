CREATE TABLE "Chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resourceId" uuid NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"language" varchar(50),
	"boundaryType" varchar(50),
	"boundaryName" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Embedding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunkId" uuid NOT NULL,
	"embedding" vector(768) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"title" text NOT NULL,
	"url" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "embeddings" CASCADE;--> statement-breakpoint
DROP TABLE "resources" CASCADE;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "ragMaxResources" integer;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "webSearchNumResults" integer;--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "ragMaxResources" integer;--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "webSearchNumResults" integer;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_resourceId_Resource_id_fk" FOREIGN KEY ("resourceId") REFERENCES "public"."Resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_chunkId_Chunk_id_fk" FOREIGN KEY ("chunkId") REFERENCES "public"."Chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embeddingIndex" ON "Embedding" USING hnsw ("embedding" vector_cosine_ops);