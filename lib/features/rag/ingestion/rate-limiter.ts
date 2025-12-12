export class EmbeddingRateLimiter {
  private maxRequestsPerMinute: number;
  private maxTokensPerMinute: number;
  private estimateTokens: (content: string) => number;

  private requestTimestamps: number[] = [];
  private tokenTimestamps: number[] = [];
  private tokenCounts: number[] = [];

  constructor(options: {
    maxRequestsPerMinute: number;
    maxTokensPerMinute: number;
    estimateTokens?: (content: string) => number;
  }) {
    this.maxRequestsPerMinute = options.maxRequestsPerMinute;
    this.maxTokensPerMinute = options.maxTokensPerMinute;
    this.estimateTokens = options.estimateTokens || this.defaultEstimateTokens;
  }

  private defaultEstimateTokens(content: string): number {
    // Estimación: 1 token ≈ 4 caracteres
    return Math.ceil(content.length / 4);
  }

  private cleanupOldEntries(now: number) {
    const oneMinuteAgo = now - 60000;

    let i = 0;
    while (
      i < this.requestTimestamps.length &&
      this.requestTimestamps[i] < oneMinuteAgo
    ) {
      i++;
    }
    this.requestTimestamps = this.requestTimestamps.slice(i);

    let j = 0;
    while (
      j < this.tokenTimestamps.length &&
      this.tokenTimestamps[j] < oneMinuteAgo
    ) {
      j++;
    }
    this.tokenTimestamps = this.tokenTimestamps.slice(j);
    this.tokenCounts = this.tokenCounts.slice(j);
  }

  private canMakeRequest(tokenEstimate: number): boolean {
    const now = Date.now();
    this.cleanupOldEntries(now);

    const currentRequestCount = this.requestTimestamps.length;
    const currentTokenSum = this.tokenCounts.reduce(
      (sum, count) => sum + count,
      0
    );

    return (
      currentRequestCount < this.maxRequestsPerMinute &&
      currentTokenSum + tokenEstimate < this.maxTokensPerMinute
    );
  }

  private recordRequest(tokenEstimate: number) {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.tokenTimestamps.push(now);
    this.tokenCounts.push(tokenEstimate);
  }

  async acquire(content: string): Promise<void> {
    const tokenEstimate = this.estimateTokens(content);

    while (!this.canMakeRequest(tokenEstimate)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.recordRequest(tokenEstimate);
  }

  async execute<T>(content: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(content);
    return fn();
  }
}

// Singleton instance for the application
export const embeddingRateLimiter = new EmbeddingRateLimiter({
  maxRequestsPerMinute: 2000,
  maxTokensPerMinute: 150000,
});
