import type { SimulationMetrics, TranscriptMessage, CompactionSnapshot, ResponseMetric } from "./types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageTokens(msg: TranscriptMessage): number {
  let tokens = estimateTokens(msg.content);
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      tokens += estimateTokens(JSON.stringify(tc.input));
      tokens += estimateTokens(tc.output ?? "");
    }
  }
  if (msg.reasoning) {
    tokens += estimateTokens(msg.reasoning);
  }
  return tokens;
}

export function computeMetrics(
  messages: TranscriptMessage[],
  snapshots: CompactionSnapshot[],
  responses: ResponseMetric[],
): SimulationMetrics {
  let totalUserTokens = 0;
  let totalAssistantTokens = 0;

  const apiOutputTokens = responses.reduce(
    (sum, r) => sum + (r.outputTokens ?? 0),
    0,
  );

  for (const msg of messages) {
    if (msg.role === "user") {
      totalUserTokens += estimateTokens(msg.content);
    }
  }

  totalAssistantTokens =
    apiOutputTokens > 0
      ? apiOutputTokens
      : messages
          .filter((m) => m.role === "assistant")
          .reduce((sum, m) => sum + messageTokens(m), 0);

  const tokenCompressionRatios = snapshots
    .map((s) => {
      const summaryTokens = estimateTokens(s.summary);
      return s.tokensBefore > 0 ? s.tokensBefore / Math.max(summaryTokens, 1) : 0;
    })
    .filter((r) => r > 0);

  return {
    totalMessages: messages.length,
    totalUserTokens,
    totalAssistantTokens,
    compactionEvents: snapshots.length,
    responses,
    tokenCompressionRatios,
  };
}
