CREATE TABLE "UserApiKey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "UserApiKey_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;