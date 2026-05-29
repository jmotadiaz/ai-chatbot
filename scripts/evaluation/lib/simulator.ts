import { randomUUID } from "crypto";
import { generateText } from "ai";
import type { TranscriptMessage } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

interface SimulatorOptions {
  modelKey: string;
  scenarioPrompt: string;
}

export function createSimulator(options: SimulatorOptions) {
  const { scenarioPrompt, modelKey } = options;

  const modelMap: Record<string, () => ReturnType<typeof providers.openrouter | typeof providers.opencodeGo>> = {
    "Deepseek v4 Flash": () => providers.opencodeGo("deepseek-v4-flash"),
    "Deepseek v4 Pro": () => providers.opencodeGo("deepseek-v4-pro"),
    "Nemotron 3 Nano": () => providers.openrouter("nvidia/nemotron-3-nano-30b-a3b:free"),
    "Nemotron 3 Super": () => providers.openrouter("nvidia/nemotron-3-super-120b-a12b:free"),
  };

  const modelFactory = modelMap[modelKey];
  if (!modelFactory) {
    throw new Error(
      `Unknown simulator model: ${modelKey}. Available: ${Object.keys(modelMap).join(", ")}`,
    );
  }

  return {
    async generateNextMessage(
      history: TranscriptMessage[],
      _messageIndex: number,
    ): Promise<TranscriptMessage> {
      const historyText = formatHistory(history);

      const prompt = `${scenarioPrompt}

## Conversation so far
${historyText || "(This is the first message — start the conversation)"}

Respond ONLY with the next user message. Do NOT include any meta-commentary, role labels, or formatting. Just write the message content as if you were a user chatting with an AI assistant. Your message should feel natural and conversational.`;

      const result = await generateText({
        model: modelFactory(),
        prompt,
        temperature: 0.9,
        maxOutputTokens: 500,
      });

      const content = result.text.trim().replace(/^(User:|Human:)\s*/i, "").trim();

      return {
        id: randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

function formatHistory(history: TranscriptMessage[]): string {
  return history
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      const content = msg.content.slice(0, 2000);
      return `${role}: ${content}`;
    })
    .join("\n\n");
}
