ALTER TABLE "Chunk" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;

-- Backfill: assign document-order positions to existing chunks
UPDATE "Chunk" c SET "position" = sub.rn - 1
FROM (
  SELECT id, row_number() OVER (PARTITION BY "resourceId" ORDER BY "createdAt", id) AS rn
  FROM "Chunk"
) sub
WHERE c.id = sub.id;
