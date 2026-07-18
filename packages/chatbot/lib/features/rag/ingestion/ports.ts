export interface RagIngestionAiPort {
  generateEmbeddings(
    inputs: { chunkId: string; content: string }[],
  ): Promise<{ chunkId: string; embedding: number[] }[]>;
}
