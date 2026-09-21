import { createScorer } from "evalite";
import {
  MODE_ROUTING_MODE_TO_CLASS,
  type ModeRoutingClass,
} from "../../scenarios/mode-routing-dataset";
import { CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD } from "@/lib/features/chat/mode-routing/constants";
import type {
  ChatModeRoutingMetadata,
  ChatModeRoutingReason,
  ResolvedChatMode,
  RoutingOption,
} from "@/lib/features/chat/mode-routing";

/** One dataset entry after it went through the real router. */
export interface ModeRoutingCaseResult {
  id: string;
  lang: "es" | "en";
  message: string;
  withPreviousTurn: boolean;
  expected: ModeRoutingClass;
  /**
   * Raw classifier answer, before the confidence gate. Absent when the call
   * itself failed (transport error / timeout → `fallback`).
   */
  raw?: {
    mode: ResolvedChatMode;
    confidence?: number;
    probabilities?: Partial<Record<RoutingOption, number>>;
  };
  /** What `resolveChatMode()` resolved the turn to (post-policy). */
  resolved: ChatModeRoutingMetadata;
  /** Router latency in ms (`resolved.latencyMs` when the call succeeded). */
  latencyMs?: number;
}

export interface ModeRoutingEvalOutput {
  results: ModeRoutingCaseResult[];
  run: {
    datasetSize: number;
    questionVersion: number;
    threshold: number;
    concurrency: number;
  };
}

export interface ModeRoutingEvalInput {
  label: string;
}

export interface ModeRoutingEvalExpected {
  datasetSize: number;
  questionVersion: number;
  threshold: number;
}

export interface ModeRoutingClassAccuracy {
  total: number;
  correct: number;
  /** `correct / total`, 0 when the class has no entries. */
  accuracy: number;
}

export type ModeRoutingConfusion = Record<
  ModeRoutingClass,
  Record<ModeRoutingClass, number>
>;

export interface ModeRoutingReport {
  total: number;
  correct: number;
  accuracy: number;
  perClass: Record<ModeRoutingClass, ModeRoutingClassAccuracy>;
  /** Unweighted mean of the three per-class accuracies (classes count equally). */
  macroAccuracy: number;
  confusion: ModeRoutingConfusion;
  reasonCounts: Record<ChatModeRoutingReason, number>;
  confidence: {
    /** Raw classifier confidence of every correct call. */
    correct: number[];
    /**
     * Raw confidence of the correct calls the gate actually let through to a
     * tool-backed mode (`reason: "routed"`): the population a threshold change
     * moves.
     */
    correctToolBacked: number[];
    buckets: Array<{ range: string; count: number }>;
    min: number | null;
    max: number | null;
    mean: number | null;
    median: number | null;
  };
  /**
   * What the global accuracy would have been with a different confidence gate,
   * replayed over the raw classifier answers from this same run (no extra API
   * calls). Mirrors the rule in `mode-routing/policy.ts`.
   */
  thresholdSweep: Array<{ threshold: number; correct: number; accuracy: number }>;
  /** Thresholds (among the swept ones) with the best swept accuracy. */
  bestThresholds: number[];
  /**
   * Widest threshold band that reaches the best swept accuracy. A band that
   * contains the current threshold means no gate tuning is justified by this
   * run.
   */
  flatOptimum: { from: number; to: number; accuracy: number } | null;
  currentThreshold: number;
  latency: {
    mean: number | null;
    p95: number | null;
    max: number | null;
    /** Calls that failed (`reason: "fallback"`). */
    failures: number;
  };
}

const CLASSES: readonly ModeRoutingClass[] = ["ctx7", "web", "neither"];

const SWEEP_STEP = 0.05;

const round = (value: number, digits = 4): number =>
  Number(value.toFixed(digits));

const emptyConfusion = (): ModeRoutingConfusion =>
  Object.fromEntries(
    CLASSES.map((expected) => [
      expected,
      Object.fromEntries(CLASSES.map((predicted) => [predicted, 0])),
    ]),
  ) as ModeRoutingConfusion;

const mean = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

/**
 * Policy replay used only for the threshold sweep: same rule as
 * `decideResolvedMode()`, parameterized by the candidate threshold.
 */
const replayResolvedMode = (
  raw: ModeRoutingCaseResult["raw"],
  threshold: number,
): ResolvedChatMode => {
  if (!raw) return "neutral";
  if (raw.mode === "neutral") return "neutral";
  if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence)) {
    return "neutral";
  }
  return raw.confidence >= threshold ? raw.mode : "neutral";
};

const sweepThresholds = (): number[] => {
  const thresholds: number[] = [];
  for (let t = 0; t <= 1.0001; t += SWEEP_STEP) {
    thresholds.push(round(t, 2));
  }
  if (!thresholds.includes(CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD)) {
    thresholds.push(CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD);
  }
  return thresholds;
};

/** Pure aggregation of one eval run; every scorer below reads from this. */
export const buildModeRoutingReport = (
  results: ModeRoutingCaseResult[],
): ModeRoutingReport => {
  const perClass = Object.fromEntries(
    CLASSES.map((cls) => [cls, { total: 0, correct: 0, accuracy: 0 }]),
  ) as Record<ModeRoutingClass, ModeRoutingClassAccuracy>;
  const confusion = emptyConfusion();
  const reasonCounts: Record<ChatModeRoutingReason, number> = {
    routed: 0,
    neither: 0,
    low_confidence: 0,
    fallback: 0,
  };
  const correctConfidences: number[] = [];
  const correctToolBackedConfidences: number[] = [];
  const latencies: number[] = [];
  let correct = 0;
  let failures = 0;

  for (const result of results) {
    const predicted = MODE_ROUTING_MODE_TO_CLASS[result.resolved.mode];
    const isCorrect = predicted === result.expected;

    perClass[result.expected].total += 1;
    confusion[result.expected][predicted] += 1;
    reasonCounts[result.resolved.reason] += 1;

    if (result.resolved.reason === "fallback") failures += 1;

    if (typeof result.latencyMs === "number") latencies.push(result.latencyMs);

    if (isCorrect) {
      correct += 1;
      perClass[result.expected].correct += 1;
      if (typeof result.raw?.confidence === "number") {
        correctConfidences.push(result.raw.confidence);
        if (result.resolved.reason === "routed") {
          correctToolBackedConfidences.push(result.raw.confidence);
        }
      }
    }
  }

  for (const cls of CLASSES) {
    const stats = perClass[cls];
    stats.accuracy = stats.total === 0 ? 0 : stats.correct / stats.total;
  }

  const thresholds = sweepThresholds();
  const thresholdSweep = thresholds.map((threshold) => {
    const sweptCorrect = results.filter(
      (result) =>
        MODE_ROUTING_MODE_TO_CLASS[replayResolvedMode(result.raw, threshold)] ===
        result.expected,
    ).length;
    return {
      threshold,
      correct: sweptCorrect,
      accuracy: results.length === 0 ? 0 : sweptCorrect / results.length,
    };
  });
  const bestAccuracy = Math.max(
    ...thresholdSweep.map((entry) => entry.accuracy),
    0,
  );
  const bestThresholds = thresholdSweep
    .filter((entry) => entry.accuracy === bestAccuracy)
    .map((entry) => entry.threshold);

  const buckets = Array.from({ length: 10 }, (_, index) => {
    const lower = index / 10;
    const upper = (index + 1) / 10;
    const count = correctConfidences.filter((value) =>
      index === 9 ? value >= lower && value <= upper : value >= lower && value < upper,
    ).length;
    return {
      range: `${lower.toFixed(1)}–${upper.toFixed(1)}`,
      count,
    };
  });

  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 0 : correct / results.length,
    perClass,
    macroAccuracy:
      CLASSES.reduce((sum, cls) => sum + perClass[cls].accuracy, 0) /
      CLASSES.length,
    confusion,
    reasonCounts,
    confidence: {
      correct: correctConfidences,
      correctToolBacked: correctToolBackedConfidences,
      buckets,
      min: correctToolBackedConfidences.length
        ? Math.min(...correctToolBackedConfidences)
        : null,
      max: correctToolBackedConfidences.length
        ? Math.max(...correctToolBackedConfidences)
        : null,
      mean: mean(correctToolBackedConfidences),
      median: median(correctToolBackedConfidences),
    },
    thresholdSweep,
    bestThresholds,
    flatOptimum:
      bestThresholds.length === 0
        ? null
        : {
            from: bestThresholds[0],
            to: bestThresholds[bestThresholds.length - 1],
            accuracy: bestAccuracy,
          },
    currentThreshold: CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD,
    latency: {
      mean: mean(latencies),
      p95: percentile(latencies, 0.95),
      max: latencies.length ? Math.max(...latencies) : null,
      failures,
    },
  };
};

/** One-line confusion matrix, handy in scorer metadata and terminal output. */
export const formatConfusionMatrix = (confusion: ModeRoutingConfusion): string =>
  [
    `expected \\ predicted | ${CLASSES.join(" | ")}`,
    ...CLASSES.map(
      (expected) =>
        `${expected.padEnd(18)} | ${CLASSES.map((predicted) =>
          String(confusion[expected][predicted]).padStart(
            predicted.length,
            " ",
          ),
        ).join(" | ")}`,
    ),
  ].join("\n");

/** Percentage of misroutes that the confidence gate sent to the neutral branch. */
export const countGateDegradations = (report: ModeRoutingReport): number =>
  report.reasonCounts.low_confidence;

export const modeRoutingGlobalAccuracy = createScorer<
  ModeRoutingEvalInput,
  ModeRoutingEvalOutput,
  ModeRoutingEvalExpected
>({
  name: "Global accuracy",
  description:
    "Share of messages resolved to the mode the labelled dataset expects (mean of the per-message correctness).",
  scorer: ({ output }) => {
    const report = buildModeRoutingReport(output.results);
    return {
      score: report.accuracy,
      metadata: {
        correct: report.correct,
        total: report.total,
        accuracy: round(report.accuracy),
        macroAccuracy: round(report.macroAccuracy),
        reasonCounts: report.reasonCounts,
        threshold: report.currentThreshold,
        latency: report.latency,
      },
    };
  },
});

export const modeRoutingPerClassAccuracy = createScorer<
  ModeRoutingEvalInput,
  ModeRoutingEvalOutput,
  ModeRoutingEvalExpected
>({
  name: "Per-class accuracy",
  description:
    "ctx7 / web / neither accuracy; scored as the unweighted mean of the three so a balanced dataset is not needed.",
  scorer: ({ output }) => {
    const report = buildModeRoutingReport(output.results);
    return {
      score: report.macroAccuracy,
      metadata: {
        macroAccuracy: round(report.macroAccuracy),
        perClass: Object.fromEntries(
          CLASSES.map((cls) => [
            cls,
            {
              ...report.perClass[cls],
              accuracy: round(report.perClass[cls].accuracy),
            },
          ]),
        ),
      },
    };
  },
});

export const modeRoutingConfusionMatrix = createScorer<
  ModeRoutingEvalInput,
  ModeRoutingEvalOutput,
  ModeRoutingEvalExpected
>({
  name: "Confusion matrix",
  description:
    "Expected class vs resolved class for every message. Informational; scored as the global accuracy so it does not distort the average.",
  scorer: ({ output }) => {
    const report = buildModeRoutingReport(output.results);
    return {
      score: report.accuracy,
      metadata: {
        matrix: report.confusion,
        table: formatConfusionMatrix(report.confusion),
        gateDegradations: countGateDegradations(report),
      },
    };
  },
});

export const modeRoutingConfidenceDistribution = createScorer<
  ModeRoutingEvalInput,
  ModeRoutingEvalOutput,
  ModeRoutingEvalExpected
>({
  name: "Confidence of correct calls",
  description:
    "Distribution of the raw Jev confidence on correct tool-backed calls (the population the 0.7 gate can degrade). Scored as its mean; the threshold sweep in the metadata is what justifies tuning.",
  scorer: ({ output }) => {
    const report = buildModeRoutingReport(output.results);
    return {
      score: report.confidence.mean ?? 0,
      metadata: {
        threshold: report.currentThreshold,
        correctToolBacked: {
          count: report.confidence.correctToolBacked.length,
          values: report.confidence.correctToolBacked,
          min: report.confidence.min,
          max: report.confidence.max,
          mean: report.confidence.mean,
          median: report.confidence.median,
        },
        allCorrect: {
          count: report.confidence.correct.length,
          buckets: report.confidence.buckets,
        },
        thresholdSweep: report.thresholdSweep,
        bestThresholds: report.bestThresholds,
        flatOptimum: report.flatOptimum,
        currentThreshold: report.currentThreshold,
      },
    };
  },
});

export const modeRoutingScorers = [
  modeRoutingGlobalAccuracy,
  modeRoutingPerClassAccuracy,
  modeRoutingConfusionMatrix,
  modeRoutingConfidenceDistribution,
];
