import { createScorer } from "evalite"
import type { EvalResult } from "../types"

export const compactionOccurred = createScorer<
  string,
  EvalResult,
  { minCompressionRatio: number }
>({
  name: "Compaction Occurred",
  description:
    "Verifies that compaction was triggered and meets minimum compression ratio",
  scorer: ({ output, expected }) => {
    if (!output.compacted) {
      return {
        score: 0,
        metadata: { reason: "Compaction was not triggered" },
      }
    }

    const minRatio = expected?.minCompressionRatio ?? 10
    const ratio = output.compressionRatio

    if (ratio < minRatio) {
      return {
        score: ratio / minRatio,
        metadata: {
          reason: `Compression ratio ${ratio.toFixed(1)}x below threshold ${minRatio}x`,
          actualRatio: ratio,
          threshold: minRatio,
        },
      }
    }

    return {
      score: 1,
      metadata: {
        reason: `Compaction successful with ${ratio.toFixed(1)}x compression`,
        actualRatio: ratio,
        tokensBefore: output.tokensBefore,
        tokensAfter: output.tokensAfter,
      },
    }
  },
})
