import { FileTraceSink, isTracingEnabled } from "tracing";
import type { LogLevel } from "tracing";

export async function POST(req: Request) {
  if (!isTracingEnabled()) {
    return new Response(null, { status: 204 });
  }

  const body = (await req.json()) as {
    runId: string;
    sessionId?: string;
    eventName: string;
    level: LogLevel;
    payload?: unknown;
  };

  const sink = new FileTraceSink({ runId: body.runId, truncate: false });
  await sink.open();

  sink.write({
    timestamp: new Date().toISOString(),
    runId: body.runId,
    layer: "client",
    sessionId: body.sessionId,
    level: body.level,
    eventName: body.eventName,
    payload: body.payload,
  });

  await sink.close();
  return new Response(null, { status: 201 });
}
