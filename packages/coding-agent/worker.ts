import { createServer } from "node:http";
import { FileTraceSink, isTracingEnabled, runWithTraceContext } from "tracing";
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
  try {
    const parsed = JSON.parse(body) as { params?: { _traceRunId?: string } };
    runId = parsed.params?._traceRunId ?? crypto.randomUUID();
  } catch {
    runId = crypto.randomUUID();
  }

  const sink = isTracingEnabled() ? new FileTraceSink({ runId, truncate: false }) : null;
  await sink?.open();
  try {
    const response = await runWithTraceContext({ runId, sink }, () =>
      handleRpc(body),
    );
    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    );
    if (response.body) {
      const reader = response.body.getReader();
      const onClose = () => {
        reader.cancel().catch(() => {});
      };
      res.on("close", onClose);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        res.off("close", onClose);
        reader.releaseLock();
      }
    }
    res.on("close", () => {
      if (!res.writableEnded) {
        res.end();
      }
    });
    res.end();
  } finally {
    await sink?.close();
  }
});

server.listen(port, () => {
  console.log(`Coding agent worker listening on http://localhost:${port}`);
});
