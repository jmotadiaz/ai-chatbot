export type MemoryCategory = "personal" | "professional" | "preferences";
export type MemorySource = "extracted" | "explicit";

export interface MemoryFact {
  category: MemoryCategory;
  content: string;
}

export interface MemoryFactWithEmbedding extends MemoryFact {
  embedding: number[];
}
