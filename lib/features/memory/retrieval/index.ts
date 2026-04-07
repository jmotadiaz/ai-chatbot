import "server-only";

import { embedMany } from "ai";
import { formatMemoryContext } from "./format";
import { decomposeForMemorySearch } from "./query-decomposition";
import {
  getPreferencesByUserId,
  findSimilarMemoryFacts,
} from "@/lib/features/memory/queries";
import { providers } from "@/lib/infrastructure/ai/providers";
import type { UserMemory } from "@/lib/infrastructure/db/schema";

const RETRIEVAL_SIMILARITY_THRESHOLD = 0.85;
const RETRIEVAL_TOP_N = 5;

export async function getRelevantMemory({
  userId,
  currentMessage,
}: {
  userId: string;
  currentMessage: string;
}): Promise<string | null> {
  const [preferences, contextualFacts] = await Promise.all([
    getPreferencesByUserId(userId),
    getContextualFacts({ userId, currentMessage }),
  ]);

  const allFacts: UserMemory[] = [
    ...preferences,
    ...contextualFacts.filter((f) => !preferences.some((p) => p.id === f.id)),
  ];

  const memoryContext = formatMemoryContext(allFacts);

  console.log("Memory context:", memoryContext);

  return memoryContext;
}

async function getContextualFacts({
  userId,
  currentMessage,
}: {
  userId: string;
  currentMessage: string;
}): Promise<UserMemory[]> {
  if (!currentMessage.trim()) return [];

  // 1. Decompose the message into 1-3 targeted search queries
  const queries = await decomposeForMemorySearch({ message: currentMessage });
  if (queries.length === 0) return [];

  console.dir(queries, { depth: null });

  // 2. Generate embeddings for all queries in batch
  const { embeddings } = await embedMany({
    model: providers.embedding(),
    providerOptions: {
      google: {
        outputDimensionality: 768,
        taskType: "SEMANTIC_SIMILARITY",
      },
    },
    values: queries,
  });

  // 3. Search for facts for each embedding
  const results = await Promise.all(
    embeddings.map((embedding) =>
      findSimilarMemoryFacts({
        userId,
        embedding,
        similarityThreshold: RETRIEVAL_SIMILARITY_THRESHOLD,
        limit: RETRIEVAL_TOP_N,
        categories: ["personal", "professional"],
      }),
    ),
  );

  // 4. Flatten and deduplicate results by ID
  const flattened = results.flat();
  const seenIds = new Set<string>();
  const deduplicated: UserMemory[] = [];

  for (const fact of flattened) {
    if (!seenIds.has(fact.id)) {
      seenIds.add(fact.id);
      deduplicated.push(fact);
    }
  }

  return deduplicated;
}
