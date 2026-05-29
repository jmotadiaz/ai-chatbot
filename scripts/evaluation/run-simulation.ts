import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, "../../.env.development.local") });
config({ path: resolve(__dirname, "../../.env.development") });
config({ path: resolve(__dirname, "../../.env.local") });
config({ path: resolve(__dirname, "../../.env") });

process.env.COMPACTION_CONTEXT_WINDOW = "32000";

import { createTestUser, deleteTestUser } from "./lib/auth";
import { createSimulator } from "./lib/simulator";
import { createChatbotClient } from "./lib/chatbot-client";
import { createTranscriptWriter } from "./lib/transcript-writer";
import { createCompactionDetector } from "./lib/compaction-detector";
import { computeMetrics } from "./lib/metrics";
import { colors } from "./lib/colors";
import type { SimulationConfig, ResponseMetric } from "./lib/types";

interface CliArgs {
  scenario: string;
  chatbotModel: string;
  simulatorModel: string;
  maxMessages: number;
  maxTokens: number;
  baseUrl: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const getArg = (flag: string, fallback: string) => {
    const idx = args.indexOf(`--${flag}`);
    return idx >= 0 ? args[idx + 1] : fallback;
  };

  return {
    scenario: getArg("scenario", "junior-dev-learning"),
    chatbotModel: getArg("chatbot-model", "Deepseek v4 Flash"),
    simulatorModel: getArg("simulator-model", "Deepseek v4 Flash"),
    maxMessages: parseInt(getArg("max-messages", "60"), 10),
    maxTokens: parseInt(getArg("max-tokens", "64000"), 10),
    baseUrl: getArg("base-url", "http://localhost:3000"),
  };
}

function loadScenario(name: string): string {
  const scenarioPath = resolve(__dirname, "scenarios", `${name}.txt`);
  try {
    return readFileSync(scenarioPath, "utf8").trim();
  } catch {
    console.error(colors.error(`Scenario file not found: ${scenarioPath}`));
    process.exit(1);
  }
}

async function main() {
  let userId: string | null = null;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const cleanup = async () => {
    if (userId) {
      console.log(colors.dim(" Waiting for pending compactions..."));
      await sleep(3000);
      try {
        await deleteTestUser(userId);
        console.log(colors.dim(" Test user cleaned up."));
      } catch (err) {
        console.error(colors.warn(` Cleanup warning: ${String(err).slice(0, 100)}`));
      }
    }
  };

  const handleSignal = () => {
    console.log(colors.warn("\n\n ⚠ Interrupted — cleaning up..."));
    cleanup().then(() => process.exit(0));
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  console.log("");
  console.log(
    colors.bold(
      "═══════════════════════════════════════════════════════════",
    ),
  );
  console.log(
    colors.highlight(" Compaction Evaluation — Simulating conversation"),
  );
  console.log(
    colors.bold(
      "═══════════════════════════════════════════════════════════",
    ),
  );
  console.log("");

  const args = parseArgs();

  if (!process.env.POSTGRES_URL) {
    console.error(
      colors.error("POSTGRES_URL not set. Make sure .env.test or .env is loaded."),
    );
    process.exit(1);
  }

  if (!process.env.OPENCODE_ZEN_API_KEY) {
    console.error(
      colors.error("OPENCODE_ZEN_API_KEY not set. Required for Deepseek models."),
    );
    process.exit(1);
  }

  console.log(colors.info(` Chatbot:    ${args.chatbotModel}`));
  console.log(colors.info(` Simulator:  ${args.simulatorModel}`));
  console.log(colors.info(` Scenario:   ${args.scenario}`));
  console.log(colors.info(` Base URL:   ${args.baseUrl}`));
  console.log(
    colors.info(` Limits:      ${args.maxMessages} messages / ${args.maxTokens.toLocaleString()} tokens`),
  );
  console.log("");
  console.log(colors.dim(" Setting up auth..."));
  const user = await createTestUser();
  userId = user.id;
  console.log(
    colors.dim(` Test user created: ${user.email} (${user.id.slice(0, 8)})`),
  );

  const scenarioPrompt = loadScenario(args.scenario);

  const config: SimulationConfig = {
    scenario: args.scenario,
    simulatorModel: args.simulatorModel,
    chatbotModel: args.chatbotModel,
    maxMessages: args.maxMessages,
    maxTokens: args.maxTokens,
    baseUrl: args.baseUrl,
  };

  const writer = createTranscriptWriter();
  writer.init(config);

  console.log("");

  const simulator = createSimulator({
    modelKey: args.simulatorModel,
    scenarioPrompt,
  });

  const client = createChatbotClient({
    baseUrl: args.baseUrl,
    cookie: user.cookie,
    model: args.chatbotModel,
  });

  let chatId: string | undefined;
  let contextTokens = 0;
  let msgIndex = 0;
  let compactionDetector: ReturnType<typeof createCompactionDetector> | null =
    null;

  const responses: ResponseMetric[] = [];

  while (msgIndex < args.maxMessages && contextTokens < args.maxTokens) {
    msgIndex++;

    try {
      console.log(colors.separator());
      console.log(colors.dim(` [${msgIndex}/${args.maxMessages}]`));

      const userMsg = await simulator.generateNextMessage(
        writer.getTranscript()?.messages ?? [],
        msgIndex,
      );

      console.log(colors.user("\n You:"));
      console.log(colors.user(`  ${userMsg.content}`));
      console.log("");

      writer.appendMessage(userMsg);

      console.log(colors.assistant(" Assistant:"));
      process.stdout.write(colors.assistant("  "));

      const startTime = performance.now();
      const result = await client.sendMessage(
        writer.getTranscript()?.messages ?? [],
        chatId,
      );
      const latencyMs = Math.round(performance.now() - startTime);

      if (result.chatId && !chatId) {
        chatId = result.chatId;
        console.log("");
        console.log(colors.dim(` Chat created: ${chatId.slice(0, 8)}...`));

        compactionDetector = createCompactionDetector(chatId);
      }

      contextTokens = result.usage.inputTokens;

      result.message.content = result.textContent;
      writer.appendMessage(result.message);

      responses.push({
        messageIndex: msgIndex,
        latencyMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });

      console.log("");
      console.log(
        colors.dim(
          ` ${(result.usage.outputTokens || 0).toLocaleString()} tok out · ${latencyMs}ms`,
        ),
      );

      if (compactionDetector) {
        try {
          const snapshot = await compactionDetector.poll();
          if (snapshot) {
            writer.appendCompactionSnapshot(snapshot);
            const summaryTokens = Math.ceil(
              snapshot.summary.length / 4,
            );
            const compression =
              snapshot.tokensBefore /
              Math.max(summaryTokens, 1);
            console.log(
              colors.highlight(
                `\n ⚡ Compaction! ${snapshot.tokensBefore.toLocaleString()} → ${summaryTokens.toLocaleString()} tokens (${compression.toFixed(1)}x compression)`,
              ),
            );
            const summaryPreview =
              snapshot.summary.length > 120
                ? snapshot.summary.slice(0, 120) + "..."
                : snapshot.summary;
            console.log(
              colors.dim(`   Model: ${snapshot.modelUsed}  `) +
                colors.dim(`Summary: ${summaryPreview}`),
            );

            console.log(
              colors.dim(
                `   Context before: ~${snapshot.tokensBefore.toLocaleString()} tokens`,
              ),
            );

            console.log(
              colors.highlight(
                `\n ⏹ Simulation stopped: compaction executed.`,
              ),
            );

            break;
          }
        } catch (compactionErr) {
          console.error(
            colors.warn(
              `   Compaction poll error: ${String(compactionErr).slice(0, 100)}`,
            ),
          );
        }
      }

      console.log(
        colors.dim(`   Context: ~${contextTokens.toLocaleString()} tokens`),
      );
    } catch (err) {
      console.error(
        colors.error(`\n Error at message ${msgIndex}: ${String(err).slice(0, 300)}`),
      );
      console.error(colors.dim(" Stopping simulation due to error."));
      break;
    }
  }

  const finalMessages = writer.getTranscript()?.messages ?? [];
  const finalSnapshots = writer.getTranscript()?.compactionSnapshots ?? [];

  const metrics = computeMetrics(finalMessages, finalSnapshots, responses);
  const transcriptPath = writer.finalize(metrics);

  console.log("");
  console.log(colors.separator());
  console.log(
    colors.bold(
      "═══════════════════════════════════════════════════════════",
    ),
  );
  console.log(
    colors.highlight(" Simulation complete"),
  );
  console.log(colors.info(` Messages:        ${metrics.totalMessages}`));
  console.log(
    colors.info(` User tokens:     ~${metrics.totalUserTokens.toLocaleString()}`),
  );
  console.log(
    colors.info(
      ` Assistant tokens (output): ~${metrics.totalAssistantTokens.toLocaleString()}`,
    ),
  );
  console.log(
    colors.info(` Compaction events: ${metrics.compactionEvents}`),
  );

  if (metrics.tokenCompressionRatios.length > 0) {
    const avgRatio =
      metrics.tokenCompressionRatios.reduce((a, b) => a + b, 0) /
      metrics.tokenCompressionRatios.length;
    console.log(
      colors.info(` Avg compression ratio: ${avgRatio.toFixed(1)}x`),
    );
  }

  if (responses.length > 0) {
    const sorted = [...responses].sort((a, b) => a.latencyMs - b.latencyMs);
    const p50 = sorted[Math.floor(sorted.length * 0.5)].latencyMs;
    const p95 = sorted[Math.floor(sorted.length * 0.95)].latencyMs;
    console.log(colors.info(` Latency p50:     ${p50}ms`));
    console.log(colors.info(` Latency p95:     ${p95}ms`));
  }

  console.log(
    colors.dim(`\n Transcript saved: ${transcriptPath}`),
  );
  console.log(
    colors.bold(
      "═══════════════════════════════════════════════════════════",
    ),
  );
  console.log("");

  await cleanup();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(colors.error(`\nFatal error: ${String(err)}`));
  console.error(err);
  process.exit(1);
});
