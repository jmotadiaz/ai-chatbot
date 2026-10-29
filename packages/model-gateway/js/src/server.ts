/**
 * Node HTTP server transport of the testing toolkit.
 *
 * The only module of the package allowed to import `node:http`. It reuses the
 * scenario dispatcher and `renderChatResponse` (through the dispatcher), so a
 * server response and an MSW response are the same bytes. Per-server lifecycle
 * state: every SSE write owns its timers and is aborted by `close()` or by the
 * client disconnecting mid-stream.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { JSON_HEADERS, SSE_HEADERS } from "./protocol";
import type { GatewayScenario } from "./scenario";
import type { SseEvent } from "./types";

export interface GatewayServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface StartGatewayServerOptions {
  /** Ephemeral port when omitted (`0`). */
  port?: number;
  host?: string;
}

interface StreamControl {
  aborted: boolean;
  wait(ms: number): Promise<void>;
  cancel(): void;
}

function createStreamControl(timers: Set<NodeJS.Timeout>): StreamControl {
  const pending = new Set<() => void>();
  const control: StreamControl = {
    aborted: false,
    wait(ms: number): Promise<void> {
      if (control.aborted || ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          pending.delete(cancel);
          resolve();
        }, ms);
        const cancel = () => {
          clearTimeout(timer);
          timers.delete(timer);
          pending.delete(cancel);
          resolve();
        };
        timers.add(timer);
        pending.add(cancel);
      });
    },
    cancel() {
      control.aborted = true;
      for (const cancel of [...pending]) cancel();
    },
  };
  return control;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

function sendBinary(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body: Uint8Array,
): void {
  res.writeHead(status, { ...headers, "Content-Length": String(body.byteLength) });
  res.end(body);
}

/**
 * Starts a gateway server for the scenario. The port is ephemeral unless
 * requested; the caller owns the lifetime and must call `close()`.
 */
export async function startGatewayServer(
  scenario: GatewayScenario,
  options: StartGatewayServerOptions = {},
): Promise<GatewayServer> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 0;

  const timers = new Set<NodeJS.Timeout>();
  const active = new Set<{ response: ServerResponse; control: StreamControl }>();
  let closed = false;
  let closing: Promise<void> | undefined;

  async function writeSse(res: ServerResponse, events: SseEvent[]): Promise<void> {
    const control = createStreamControl(timers);
    const entry = { response: res, control };
    active.add(entry);
    res.on("close", () => {
      // The client disconnected: release this stream's timers instead of
      // writing into a destroyed socket (which would emit write-after-end).
      control.cancel();
      active.delete(entry);
    });

    res.writeHead(200, SSE_HEADERS);
    try {
      for (const event of events) {
        if (control.aborted) return;
        if (event.delayMs !== undefined) await control.wait(event.delayMs);
        if (control.aborted || res.destroyed || res.writableEnded) return;
        res.write(event.frame);
      }
      if (!res.destroyed && !res.writableEnded) res.end();
    } finally {
      active.delete(entry);
    }
  }

  async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // A client aborting a stream emits 'error' on the response; it is expected
    // (the stream is over), not a server failure.
    res.on("error", () => {});
    try {
      const body = await readBody(req);
      if (closed) {
        res.destroy();
        return;
      }
      const result = scenario.handle(req.method ?? "GET", req.url ?? "/", {
        body,
        headers: req.headers,
      });
      if (result.kind === "json") {
        sendJson(res, result.status, result.body, result.headers);
        return;
      }
      if (result.kind === "binary") {
        sendBinary(res, result.status, result.headers, result.body);
        return;
      }
      await writeSse(res, result.events);
    } catch {
      if (!res.destroyed && !res.writableEnded) sendJson(res, 500, {
        error: { message: "Gateway server failed to handle the request", type: "server_error" },
      });
    }
  }

  const server = createServer((req, res) => {
    void serve(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, host);
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : requestedPort;

  return {
    port,
    url: `http://${host}:${port}`,
    close(): Promise<void> {
      if (closing) return closing;
      closing = (async () => {
        closed = true;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        for (const entry of [...active]) {
          entry.control.cancel();
          entry.response.destroy();
        }
        active.clear();
        const stopped = new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
        await stopped;
      })();
      return closing;
    },
  };
}
