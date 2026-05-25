export interface CompactionAiPort {
  generateText(
    modelKey: string,
    system: string,
    prompt: string,
  ): Promise<string>;
}
