import type { UserMemory } from "@/lib/infrastructure/db/schema";

export function formatMemoryContext(facts: UserMemory[]): string | null {
  if (facts.length === 0) return null;

  const lines = facts.map((f) => `- ${f.content}`).join("\n");
  return `## What you know about the user\n${lines}`;
}
