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
import type { GatewayDispatch, GatewayResult } from "./types";

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
    case "sse":
      return new HttpResponse(
        result.events.map((event) => event.frame).join(""),
        { status: result.status, headers: { ...SSE_HEADERS } },
      );
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
