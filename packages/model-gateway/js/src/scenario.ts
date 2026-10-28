/**
 * Per-instance gateway scenarios.
 *
 * A scenario binds consumer-owned responders and catalog to one dispatcher. All
 * execution state lives in the instance: recorded requests are per scenario,
 * tool continuations are derived from the request history by the consumer, and
 * there is no global response queue, execution counter or implicit reset. Two
 * tests can therefore build their own scenario and run concurrently.
 */

import { createGatewayHandlers } from "./msw";
import {
  HEALTH_BODY,
  HEALTH_PATH,
  catalogResponse,
  errorBody,
  renderChatResponse,
  unauthorizedResponse,
} from "./protocol";
import type { RequestHandler } from "msw";
import type {
  ChatReply,
  ChatRequest,
  DecisionsRequest,
  EmbeddingsRequest,
  GatewayDispatch,
  GatewayHeaders,
  GatewayResult,
  OperationReply,
  RecordedRequest,
  RerankRequest,
  SpeechRequest,
} from "./types";

/** Default authorization: any non-empty `Authorization` header is accepted. */
export function hasAuthorization(headers: GatewayHeaders): boolean {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "authorization") continue;
    return typeof value === "string" && value.length > 0;
  }
  return false;
}

/**
 * An explicit scenario error: the dispatcher renders it with `status` and type
 * instead of a generic success. Responders throw it when their configuration or
 * the incoming request is unsupported.
 */
export class GatewayScenarioError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly type: string = "invalid_scenario_configuration",
  ) {
    super(message);
    this.name = "GatewayScenarioError";
  }
}

/** Consumer-owned responders and catalog of one scenario instance. */
export interface GatewayScenarioConfig {
  /** Pass-through catalog entries (the consumer owns the schema and order). */
  catalog?: { public: readonly unknown[]; internal?: readonly unknown[] };
  /** Chat responder; `undefined` means "this scenario does not support the model". */
  chat?: (request: ChatRequest) => ChatReply | undefined;
  embeddings?: (request: EmbeddingsRequest) => OperationReply;
  rerank?: (request: RerankRequest) => OperationReply;
  decisions?: (request: DecisionsRequest) => OperationReply;
  speech?: (request: SpeechRequest) => OperationReply;
  /**
   * When true the internal catalog entries are listed even without
   * `?include_internal=true`. Consumers keep the Gateway default (`false`).
   */
  catalogInternal?: boolean;
  authorize?: (headers: GatewayHeaders) => boolean;
}

/** A scenario instance: MSW handlers, recorded requests and the shared dispatcher. */
export interface GatewayScenario {
  /** MSW handlers bound to THIS instance (state + responders). */
  handlers: RequestHandler[];
  /** Requests observed by THIS instance, oldest first. Live array. */
  requests: RecordedRequest[];
  /** Clears the recorded requests of this instance only. */
  reset(): void;
  /** Pure dispatcher used by both the MSW handlers and the HTTP server. */
  handle: GatewayDispatch;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  if (body.length === 0) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function jsonResult(status: number, body: unknown): GatewayResult {
  return { kind: "json", status, body };
}

function toResult(reply: OperationReply): GatewayResult {
  const status = reply.status ?? 200;
  if (reply.body instanceof Uint8Array) {
    return { kind: "binary", status, headers: reply.headers ?? {}, body: reply.body };
  }
  return { kind: "json", status, headers: reply.headers, body: reply.body };
}

function unsupportedOperation(path: string): GatewayResult {
  return jsonResult(
    422,
    errorBody(
      `This gateway scenario does not implement ${path}`,
      "unsupported_operation",
    ),
  );
}

function runOperation(
  path: string,
  responder: ((request: never) => OperationReply) | undefined,
  body: unknown,
): GatewayResult {
  if (!responder) return unsupportedOperation(path);
  return toResult(responder((body ?? {}) as never));
}

/**
 * Creates a gateway scenario. The returned `handlers` and `handle` share the same
 * dispatcher and rendering, so an in-process (MSW) test and an out-of-process
 * (HTTP server) test exercise identical behavior.
 */
export function createGatewayScenario(
  config: GatewayScenarioConfig = {},
): GatewayScenario {
  const recorded: RecordedRequest[] = [];
  const authorize = config.authorize ?? hasAuthorization;
  const catalogInternal = config.catalogInternal === true;

  const dispatch = (method: string, url: URL, body: unknown): GatewayResult => {
    if (method === "GET" && url.pathname === "/v1/models/catalog") {
      if (!config.catalog) {
        return jsonResult(
          422,
          errorBody(
            "This gateway scenario does not define a catalog",
            "unsupported_operation",
          ),
        );
      }
      const includeInternal =
        catalogInternal || url.searchParams.get("include_internal") === "true";
      return jsonResult(200, catalogResponse(config.catalog, { includeInternal }));
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      if (!config.chat) return unsupportedOperation(url.pathname);
      const request = (body ?? {}) as ChatRequest;
      const reply = config.chat(request);
      if (!reply) {
        return jsonResult(
          422,
          errorBody(
            `Unsupported model: ${request.model ?? "(none)"}`,
            "unsupported_model",
          ),
        );
      }
      if (!Array.isArray(reply.steps)) {
        throw new GatewayScenarioError(
          "Gateway scenario chat() must return a ChatReply with a steps array",
          500,
        );
      }
      const rendered = renderChatResponse(reply, {
        stream: request.stream === true,
        model: reply.model ?? request.model,
      });
      return rendered.kind === "sse"
        ? { kind: "sse", status: 200, events: rendered.events }
        : jsonResult(200, rendered.body);
    }

    if (method === "POST" && url.pathname === "/v1/embeddings") {
      return runOperation(url.pathname, config.embeddings, body);
    }
    if (method === "POST" && url.pathname === "/v1/rerank") {
      return runOperation(url.pathname, config.rerank, body);
    }
    if (method === "POST" && (url.pathname === "/v1/decisions" || url.pathname === "/v1/systemone")) {
      return runOperation(url.pathname, config.decisions, body);
    }
    if (method === "POST" && url.pathname === "/v1/audio/speech") {
      return runOperation(url.pathname, config.speech, body);
    }

    return jsonResult(
      404,
      errorBody(`Unknown route: ${method} ${url.pathname}`, "not_found"),
    );
  };

  const handle: GatewayDispatch = (method, path, init = {}) => {
    const url = new URL(path, "http://localhost");
    const headers = init.headers ?? {};
    const body = parseBody(init.body);

    // The probe route is public (it carries no credentials) and is not recorded.
    if (method === "GET" && url.pathname === HEALTH_PATH) {
      return jsonResult(200, HEALTH_BODY);
    }

    try {
      const authorized = authorize(headers);
      if (typeof authorized !== "boolean") {
        throw new GatewayScenarioError(
          "Gateway scenario authorize() must return a boolean",
          500,
        );
      }
      if (!authorized) return toResult(unauthorizedResponse());

      recorded.push({ method, path: url.pathname + url.search, headers, body });
      return dispatch(method, url, body);
    } catch (error) {
      if (error instanceof GatewayScenarioError) {
        return jsonResult(error.status, errorBody(error.message, error.type));
      }
      const message = error instanceof Error ? error.message : String(error);
      return jsonResult(500, errorBody(message, "scenario_error"));
    }
  };

  return {
    handlers: createGatewayHandlers(handle),
    requests: recorded,
    reset: () => {
      recorded.length = 0;
    },
    handle,
  };
}
