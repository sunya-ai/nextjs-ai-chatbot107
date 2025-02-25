-- lib/db/migrations/0005_add_metadata.sql
ALTER TABLE "Message" ADD COLUMN "metadata" JSONB;
