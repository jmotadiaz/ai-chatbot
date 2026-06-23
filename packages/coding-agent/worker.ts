import { createServer } from "node:http";
import {
  FileTraceSink,
  getTraceLogger,
  isTracingEnabled,
  runWithTraceContext,
} from "tracing";
import { handleRpc } from "./rpc-server";

const port = parseInt(process.env.CODING_AGENT_WORKER_PORT ?? "3015", 10);

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/rpc") {
    res.writeHead(404).end("Not found");
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf-8");

  let runId: string;
  let sessionId: string | undefined;
  let method: string | undefined;
  try {
    const parsed = JSON.parse(body) as {
      method?: string;
      params?: { _traceRunId?: string; sessionId?: string };
    };
    runId = parsed.params?._traceRunId ?? crypto.randomUUID();
    sessionId = parsed.params?.sessionId;
    method = parsed.method;
  } catch {
    runId = crypto.randomUUID();
  }

  const sink = isTracingEnabled() ? new FileTraceSink({ runId, truncate: false }) : null;
  await sink?.open();
  try {
    await runWithTraceContext({ runId, sessionId, sink }, async () => {
      const response = await handleRpc(body);
      const log = getTraceLogger("worker");
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      if (response.body) {
        const reader = response.body.getReader();
        const stopStream = log.startTimer("worker.response_stream", {
          method,
          sessionId,
          status: response.status,
        });
        let chunkCount = 0;
        let byteCount = 0;
        let closedByClient = false;
        const onClose = () => {
          if (!res.writableEnded) {
            closedByClient = true;
            log.warn("worker.response_client_closed", {
              method,
              sessionId,
              chunkCount,
              byteCount,
            });
          }
          reader.cancel().catch(() => {});
        };
        res.on("close", onClose);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunkCount += 1;
            byteCount += value.byteLength;
            res.write(value);
          }
        } finally {
          res.off("close", onClose);
          reader.releaseLock();
          stopStream();
          log.info("worker.response_stream_summary", {
            method,
            sessionId,
            status: response.status,
            chunkCount,
            byteCount,
            closedByClient,
          });
        }
      }
      res.end();
    });
  } finally {
    await sink?.close();
  }
});

server.listen(port, () => {
  console.log(`Coding agent worker listening on http://localhost:${port}`);
});
