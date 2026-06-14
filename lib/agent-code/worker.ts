import { createServer } from "node:http";
import { handleRpc } from "./rpc-server";

const port = parseInt(process.env.CODING_AGENT_WORKER_PORT ?? "9000", 10);

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

  const response = await handleRpc(body);
  res.writeHead(
    response.status,
    Object.fromEntries(response.headers.entries()),
  );
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
});

server.listen(port, () => {
  console.log(`Coding agent worker listening on http://localhost:${port}`);
});
