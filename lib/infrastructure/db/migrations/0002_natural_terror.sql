ALTER TABLE "Message" ADD COLUMN "serial" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_serial_unique" UNIQUE("serial");