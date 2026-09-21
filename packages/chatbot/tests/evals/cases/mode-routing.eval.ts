import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config as dotenv } from "dotenv";
import { evalite } from "evalite";
import {
  MODE_ROUTING_CLASS_COUNTS,
  MODE_ROUTING_CLASS_TO_MODE,
  MODE_ROUTING_DATASET,
  type ModeRoutingDatasetEntry,
} from "../scenarios/mode-routing-dataset";
import {
  buildModeRoutingReport,
  formatConfusionMatrix,
  modeRoutingScorers,
  type ModeRoutingCaseResult,
} from "../lib/scorers/mode-routing";
import {
  buildChatModeRouterInput,
  CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD,
  CHAT_MODE_ROUTING_QUESTION,
  CHAT_MODE_ROUTING_QUESTION_VERSION,
  createOpenRouterChatModeRouter,
  resolveChatMode,
} from "@/lib/features/chat/mode-routing";
import type {
  ChatModeRouterPort,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing";
import type { ChatbotMessage } from "@/lib/features/chat/types";

// Same precedence as the other eval cases: the runner already exports the evals
// env, `dotenv` only fills the gaps (OPENROUTER_API_KEY among them).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv({ path: resolve(__dirname, "../../../.env.development.local") });
dotenv({ path: resolve(__dirname, "../../../.env.dev") });

/**
 * # mode-routing eval — what it measures
 *
 * It measures the ROUTER, not a chat round trip: `resolveChatMode()` + the real
 * Jev 1.13 adapter over the OpenRouter Decisions API (`ChatModeRouterPort`),
 * fed with `buildChatModeRouterInput()` over the labelled dataset in
 * `tests/evals/scenarios/mode-routing-dataset.ts`. No `/api/chat` request, no
 * DB, no model tokens beyond the classifier: one Decisions call per dataset
 * entry (~$0.00002 each, ~$0.0008 for the whole run at 39 entries).
 *
 * ## Measured baseline (2026-09-21, 3 runs)
 *
 * Global accuracy 38/39 (97.4%), macro 97.4%: ctx7 12/13, web 13/13,
 * neither 13/13. Confusion matrix diagonal except one `ctx7 →
 * neutral/low_confidence` (a React error-semantics question answered with
 * `confidence` 0.51, `probabilities.ctx7` 0.68). 25 calls routed, 12 `neither`,
 * 2 gated, 0 fallbacks; latency mean ~450 ms, p95 ~720 ms.
 *
 * ## v1 criteria (source of truth: `lib/features/chat/mode-routing/questions.ts`)
 *
 * `CHAT_MODE_ROUTING_QUESTION_VERSION = ${CHAT_MODE_ROUTING_QUESTION_VERSION}`
 *
 * - `ctx7` → up-to-date documentation of a software library, framework, SDK,
 *   CLI tool or language API: how something works, its API surface, its
 *   configuration, or version-specific behavior.
 * - `web` → current or externally verifiable information: news and current
 *   events, prices, releases, availability, references/sources to check a
 *   claim, the content behind a URL, or a comparison that depends on the real
 *   world.
 * - `neither` → answerable with general reasoning, knowledge already present in
 *   the repository or the conversation, or plain chat. No docs, no search.
 *
 * Classifier input: `state = { latest_message, recent_context }`, where
 * `recent_context` is the previous turn (user + assistant) truncated to 500
 * chars per message. Pronoun-only follow-ups are labelled by what the referent
 * resolves to; without a previous turn the referent is unresolvable, so the
 * correct label is `neither` (do not pay for a guessed tool call).
 *
 * ## Confidence gate
 *
 * `CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD = ${CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD}`.
 *
 * Jev returns `confidence` independently from `probabilities`: the ticket-04
 * live probe answered `web` with `confidence: 0.42` and `probabilities.web:
 * 0.62`, and in this eval the two low-confidence entries answered 0.47–0.52
 * with `probabilities[choice]` 0.65–0.68. The gate is therefore tuned from
 * data, not intuition: the confidence scorer replays the whole gate over the
 * raw answers of this same run and reports the accuracy/threshold curve
 * (`thresholdSweep`, `flatOptimum`).
 *
 * Why the threshold stays at 0.7: the swept curve is flat at 97.4% for every
 * threshold between 0 and 0.75 (one run spiked to 100% *only* at 0.5 because
 * the two uncertain entries happened to straddle it; the next run did not
 * reproduce it). Lowering the gate trades the one wrong-but-gated `ctx7` for
 * the one correctly-gated `neither` — the classifier gives both the same
 * answer, so no threshold separates them, and every threshold above 0.75
 * degrades correct calls. `0.7` sits inside the flat optimum band and is the
 * smallest data-justified change: none.
 *
 * Any change to the constant has to come with the eval numbers in the commit
 * message and the affected unit tests from tickets 03/04 updated in the same
 * change.
 *
 * Scoring: the whole dataset runs inside one evalite row (the task returns
 * every per-message result), so the aggregate scorers see the complete run and
 * are exact: per-message rows plus a module-level accumulator would be racy
 * under evalite's `it.concurrent`.
 */

const ROUTER_CONCURRENCY = 4;
const ENV_LABEL = "auto-chat-mode";

const lastUserMessage = (entry: ModeRoutingDatasetEntry): ChatbotMessage => ({
  id: `${entry.id}-user`,
  role: "user",
  parts: [{ type: "text", text: entry.message }],
});

const messagesFor = (entry: ModeRoutingDatasetEntry): ChatbotMessage[] => {
  const messages: ChatbotMessage[] = [];
  if (entry.previousTurn) {
    messages.push({
      id: `${entry.id}-prev-user`,
      role: "user",
      parts: [{ type: "text", text: entry.previousTurn.user }],
    });
    messages.push({
      id: `${entry.id}-prev-assistant`,
      role: "assistant",
      parts: [{ type: "text", text: entry.previousTurn.assistant }],
    });
  }
  messages.push(lastUserMessage(entry));
  return messages;
};

/**
 * Runs one dataset entry through the real router while keeping the raw
 * classifier answer (pre-gate) for the threshold sweep.
 */
const routeEntry = async (
  entry: ModeRoutingDatasetEntry,
  realRouter: ChatModeRouterPort,
): Promise<ModeRoutingCaseResult> => {
  let raw: RoutingDecision | undefined;
  const recordingPort: ChatModeRouterPort = {
    async route(input) {
      const decision = await realRouter.route(input);
      raw = decision;
      return decision;
    },
  };

  const resolved = await resolveChatMode(
    recordingPort,
    buildChatModeRouterInput(messagesFor(entry)),
  );

  return {
    id: entry.id,
    lang: entry.lang,
    message: entry.message,
    withPreviousTurn: Boolean(entry.previousTurn),
    expected: entry.expected,
    raw: raw
      ? {
          mode: raw.mode,
          confidence: raw.confidence,
          probabilities: raw.probabilities,
        }
      : undefined,
    resolved,
    latencyMs: resolved.latencyMs,
  };
};

const runDataset = async (): Promise<ModeRoutingCaseResult[]> => {
  const realRouter = createOpenRouterChatModeRouter();
  const results = new Array<ModeRoutingCaseResult>(MODE_ROUTING_DATASET.length);

  for (let start = 0; start < MODE_ROUTING_DATASET.length; start += ROUTER_CONCURRENCY) {
    const batch = MODE_ROUTING_DATASET.slice(start, start + ROUTER_CONCURRENCY);
    await Promise.all(
      batch.map(async (entry, offset) => {
        results[start + offset] = await routeEntry(entry, realRouter);
      }),
    );
  }

  return results;
};

const printReport = (results: ModeRoutingCaseResult[]): void => {
  const report = buildModeRoutingReport(results);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  console.log("\n=== mode-routing ===");
  console.log(
    `dataset: ${report.total} messages (ctx7 ${MODE_ROUTING_CLASS_COUNTS.ctx7} / web ${MODE_ROUTING_CLASS_COUNTS.web} / neither ${MODE_ROUTING_CLASS_COUNTS.neither})`,
  );
  console.log(
    `global accuracy: ${pct(report.accuracy)} (${report.correct}/${report.total}) · macro ${pct(report.macroAccuracy)}`,
  );
  console.log(
    `per class: ctx7 ${pct(report.perClass.ctx7.accuracy)} · web ${pct(report.perClass.web.accuracy)} · neither ${pct(report.perClass.neither.accuracy)}`,
  );
  console.log(`confusion:\n${formatConfusionMatrix(report.confusion)}`);
  console.log(
    `reasons: ${JSON.stringify(report.reasonCounts)} · threshold ${report.currentThreshold} · flat optimum ${report.flatOptimum ? `${report.flatOptimum.from}–${report.flatOptimum.to} @ ${pct(report.flatOptimum.accuracy)}` : "n/a"}`,
  );
  console.log(
    `confidence of correct tool-backed calls: n=${report.confidence.correctToolBacked.length} mean=${report.confidence.mean?.toFixed(2)} median=${report.confidence.median?.toFixed(2)} min=${report.confidence.min?.toFixed(2)} max=${report.confidence.max?.toFixed(2)}`,
  );
  console.log(
    `latency ms: mean=${report.latency.mean?.toFixed(0)} p95=${report.latency.p95} max=${report.latency.max} · failures=${report.latency.failures}`,
  );

  const misses = results.filter(
    (result) => result.resolved.mode !== MODE_ROUTING_CLASS_TO_MODE[result.expected],
  );
  if (misses.length > 0) {
    console.log("misses:");
    for (const miss of misses) {
      console.log(
        `  - ${miss.id} [expected ${miss.expected} → resolved ${miss.resolved.mode}/${miss.resolved.reason}, raw ${miss.raw?.mode ?? "n/a"} c=${miss.raw?.confidence ?? "n/a"}] ${miss.message.slice(0, 70)}`,
      );
    }
  }
  console.log("=== /mode-routing ===\n");
};

/**
 * The dataset labels are derived from the criteria keys, so a criteria
 * revision that renames/removes an option must fail here instead of silently
 * producing an eval that scores against a class the router can no longer pick.
 */
const CRITERIA_KEYS = Object.keys(CHAT_MODE_ROUTING_QUESTION.criteria).sort();
if (CRITERIA_KEYS.join(",") !== "ctx7,neither,web") {
  throw new Error(
    `mode-routing dataset is out of sync with the v${CHAT_MODE_ROUTING_QUESTION_VERSION} criteria keys: ${CRITERIA_KEYS.join(", ")}`,
  );
}

evalite("Mode Routing", {
  data: [
    {
      input: { label: ENV_LABEL },
      expected: {
        datasetSize: MODE_ROUTING_DATASET.length,
        questionVersion: CHAT_MODE_ROUTING_QUESTION_VERSION,
        threshold: CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD,
      },
    },
  ],

  task: async () => {
    const results = await runDataset();
    printReport(results);

    return {
      results,
      run: {
        datasetSize: MODE_ROUTING_DATASET.length,
        questionVersion: CHAT_MODE_ROUTING_QUESTION_VERSION,
        threshold: CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD,
        concurrency: ROUTER_CONCURRENCY,
      },
    };
  },

  scorers: modeRoutingScorers,
});
