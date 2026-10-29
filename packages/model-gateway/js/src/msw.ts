/**
 * MSW transport of the testing toolkit.
 *
 * It renders the scenario's dispatcher through `msw`'s `http.*` handlers. This is
 * the ONLY place that knows about MSW: the toolkit never starts interception nor
 * registers test-runner hooks, the consumer owns `setupServer(...scenario.handlers)`
 * (listen, reset, close).
 *
 * Never import `node:http` from here: the main entry of the package is loaded by
 * jsdom workers.
 */

import { HttpResponse, http, type RequestHandler } from "msw";
import { HEALTH_PATH, JSON_HEADERS, SSE_HEADERS } from "./protocol";
import type { GatewayDispatch, GatewayResult, SseEvent } from "./types";

/**
 * Renders the SSE events as a real stream so the scenario's `delayMs` pacing
 * reaches the consumer: MSW does not buffer a `ReadableStream` body, it hands it
 * to the intercepted client frame by frame. Timers are tracked and released when
 * the consumer cancels, so a cancelled stream leaves nothing running.
 */
function sseStream(events: readonly SseEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const pending = new Set<() => void>();
  let cancelled = false;

  /** Resolves on timeout, or immediately when the consumer cancels. */
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        pending.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      pending.add(finish);
    });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const event of events) {
          if (event.delayMs !== undefined && event.delayMs > 0) {
            await sleep(event.delayMs);
          }
          if (cancelled) return;
          controller.enqueue(encoder.encode(event.frame));
        }
        if (!cancelled) controller.close();
      } catch {
        // The consumer cancelled between the pacing wait and the enqueue.
      }
    },
    cancel() {
      cancelled = true;
      // Settle the in-flight wait so the stream's `start` returns and the
      // intercepted request finishes instead of staying open until the pacing
      // would have elapsed.
      for (const finish of [...pending]) finish();
    },
  });
}

function toHttpResponse(result: GatewayResult): Response {
  switch (result.kind) {
    case "json":
      return new HttpResponse(JSON.stringify(result.body), {
        status: result.status,
        headers: { ...JSON_HEADERS, ...result.headers },
      });
    case "binary":
      return new HttpResponse(result.body, {
        status: result.status,
        headers: result.headers,
      });
    case "sse": {
      // A paced scenario streams; an unpaced one keeps the simple buffered body.
      const paced = result.events.some((event) => (event.delayMs ?? 0) > 0);
      const body = paced
        ? sseStream(result.events)
        : result.events.map((event) => event.frame).join("");
      return new HttpResponse(body, {
        status: result.status,
        headers: { ...SSE_HEADERS },
      });
    }
  }
}

/**
 * Wraps a scenario dispatcher in MSW handlers. One catch-all handler per
 * well-known prefix keeps every request on the same dispatch path: unknown routes
 * are answered with the dispatcher's explicit 404 instead of an unhandled-request
 * error.
 */
export function createGatewayHandlers(dispatch: GatewayDispatch): RequestHandler[] {
  const resolver = async ({ request }: { request: Request }): Promise<Response> => {
    const url = new URL(request.url);
    const body = await request.text();
    const result = dispatch(request.method, url.pathname + url.search, {
      body,
      headers: Object.fromEntries(request.headers.entries()),
    });
    return toHttpResponse(result);
  };

  return [
    http.get(`*${HEALTH_PATH}`, resolver),
    http.all("*/v1/*", resolver),
  ];
}
