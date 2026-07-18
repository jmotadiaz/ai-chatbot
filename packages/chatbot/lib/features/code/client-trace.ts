type ClientTraceLevel = "debug" | "info" | "warn" | "error";

interface ClientTraceInput {
  runId: string;
  sessionId: string;
  eventName: string;
  level?: ClientTraceLevel;
  payload?: unknown;
}

export function writeClientTrace({
  runId,
  sessionId,
  eventName,
  level = "info",
  payload,
}: ClientTraceInput): void {
  if (typeof window === "undefined") return;

  void fetch("/api/agent/code/trace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      runId,
      sessionId,
      eventName,
      level,
      payload,
    }),
  }).catch(() => {
    // Client tracing must never affect the coding-agent UI lifecycle.
  });
}
