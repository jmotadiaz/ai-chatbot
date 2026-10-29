/**
 * Embedding budget limiter. Internal to the feature: `./index.ts` deliberately
 * does not re-export it, so the production surface is the singleton below and the
 * constructor options never become a public knob.
 */
export class EmbeddingRateLimiter {
  private maxRequestsPerMinute: number;
  private maxTokensPerMinute: number;
  private windowMs: number;
  private now: () => number;
  private estimateTokens: (content: string) => number;

  private requestTimestamps: number[] = [];
  private tokenTimestamps: number[] = [];
  private tokenCounts: number[] = [];

  /**
   * `windowMs`, `estimateTokens` and `now` describe a real production budget, not
   * a test switch: a consumer with a different quota (another window, its own
   * token estimate) constructs its own limiter instead of editing the singleton,
   * which keeps the one-minute window and the system clock. An explicit clock is
   * also how a test observes the blocking branch without an arbitrary sleep; that
   * is the secondary use, and it is why the mechanism is an injected clock rather
   * than a special test mode.
   */
  constructor(options: {
    maxRequestsPerMinute: number;
    maxTokensPerMinute: number;
    windowMs?: number;
    now?: () => number;
    estimateTokens?: (content: string) => number;
  }) {
    this.maxRequestsPerMinute = options.maxRequestsPerMinute;
    this.maxTokensPerMinute = options.maxTokensPerMinute;
    this.windowMs = options.windowMs ?? 60000;
    this.now = options.now ?? Date.now;
    this.estimateTokens = options.estimateTokens || this.defaultEstimateTokens;
  }

  private defaultEstimateTokens(content: string): number {
    // Estimate: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  private cleanupOldEntries(now: number) {
    const windowStart = now - this.windowMs;

    let i = 0;
    while (
      i < this.requestTimestamps.length &&
      this.requestTimestamps[i] < windowStart
    ) {
      i++;
    }
    this.requestTimestamps = this.requestTimestamps.slice(i);

    let j = 0;
    while (
      j < this.tokenTimestamps.length &&
      this.tokenTimestamps[j] < windowStart
    ) {
      j++;
    }
    this.tokenTimestamps = this.tokenTimestamps.slice(j);
    this.tokenCounts = this.tokenCounts.slice(j);
  }

  private canMakeRequest(tokenEstimate: number, requestCount: number): boolean {
    const now = this.now();
    this.cleanupOldEntries(now);

    const currentRequestCount = this.requestTimestamps.length;
    const currentTokenSum = this.tokenCounts.reduce(
      (sum, count) => sum + count,
      0,
    );

    return (
      currentRequestCount + requestCount <= this.maxRequestsPerMinute &&
      currentTokenSum + tokenEstimate <= this.maxTokensPerMinute
    );
  }

  private recordRequest(tokenEstimate: number, requestCount: number) {
    const now = this.now();
    for (let i = 0; i < requestCount; i++) {
      this.requestTimestamps.push(now);
    }
    this.tokenTimestamps.push(now);
    this.tokenCounts.push(tokenEstimate);
  }

  async acquire(contents: string[]): Promise<void> {
    const concatenatedContent = contents.join("");
    const tokenEstimate = this.estimateTokens(concatenatedContent);
    const requestCount = contents.length;

    while (!this.canMakeRequest(tokenEstimate, requestCount)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.recordRequest(tokenEstimate, requestCount);
  }

  async execute<T>(contents: string[], fn: () => Promise<T>): Promise<T> {
    await this.acquire(contents);
    return fn();
  }
}

// Singleton instance for the application
export const embeddingRateLimiter = new EmbeddingRateLimiter({
  maxRequestsPerMinute: 2000,
  maxTokensPerMinute: 350000,
});
