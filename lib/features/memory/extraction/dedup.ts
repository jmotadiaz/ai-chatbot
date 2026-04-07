import "server-only";

import { findSimilarMemoryFacts, insertMemoryFact, updateMemoryFact } from "@/lib/features/memory/queries";
import { getDb } from "@/lib/infrastructure/db/db";
import type { MemoryFactWithEmbedding } from "@/lib/features/memory/types";

const DEDUP_SIMILARITY_THRESHOLD = 0.85;

export async function upsertMemoryFact({
  userId,
  fact,
}: {
  userId: string;
  fact: MemoryFactWithEmbedding;
}): Promise<void> {
  const db = getDb();

  const matches = await findSimilarMemoryFacts({
    userId,
    embedding: fact.embedding,
    similarityThreshold: DEDUP_SIMILARITY_THRESHOLD,
    limit: 1,
  });

  if (matches.length > 0) {
    const existing = matches[0];
    await db.transaction(async (tx) => {
      await updateMemoryFact({
        id: existing.id,
        content: fact.content,
        embedding: fact.embedding,
      })(tx);
    });
  } else {
    await db.transaction(async (tx) => {
      await insertMemoryFact({
        userId,
        category: fact.category,
        content: fact.content,
        embedding: fact.embedding,
        source: "extracted",
      })(tx);
    });
  }
}
