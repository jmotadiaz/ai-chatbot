# `@ai-chatbot/model-gateway-testing`

Official testing toolkit for the Model Gateway's HTTP protocol (ADR 0013,
`.scratch/model-gateway-testing/spec.md` §3–§4).

It provides reusable **protocol fixtures**, **per-instance scenarios**, **MSW
handlers** and a **Node HTTP server** that share one dispatch and one rendering
implementation. It is a testing package: no production client, no test-runner
hooks, no dependency on the Python Gateway, and nothing to deploy. The Python
service stays runnable without Node or workspace dependencies.

Consumers own their test catalogs, model ids, capabilities, E2E profiles and
operation responses.

## Entry points

| Export | Contents |
| :-- | :-- |
| `@ai-chatbot/model-gateway-testing` | Protocol fixtures and builders, `createGatewayScenario`, MSW handler factory. **Never imports `node:http`** (safe in jsdom workers). |
| `@ai-chatbot/model-gateway-testing/server` | `startGatewayServer(scenario, { port?, host? })` — the only module that imports `node:http`. |

There is no dependency on Vitest and no implicit lifecycle: the consumer starts
and stops MSW (`setupServer(...scenario.handlers)`) and owns the server handle.

## Defining a catalog and the replies

The catalog schema is the consumer's: the toolkit passes entries through and keeps
their order. Internal entries (Default Model Contracts) are hidden unless the
request asks `?include_internal=true`.

```ts
import {
  createGatewayScenario,
  textReply,
  toolCallReply,
  toolResultReply,
} from "@ai-chatbot/model-gateway-testing";

export const scenario = createGatewayScenario({
  // Consumer-owned entries (any shape).
  catalog: { public: [{ id: "basicChat" }], internal: [{ id: "fast-default" }] },
  // Return `undefined` for a model the scenario does not support: the toolkit
  // answers 422 `unsupported_model` instead of a generic success.
  chat: (request) => {
    if (request.model === "basicChat") return textReply("hello");
    if (request.model === "canExecuteTools") {
      // Derive the turn from the request history, never from a counter.
      return request.messages?.at(-1)?.role === "tool"
        ? toolResultReply("done")
        : toolCallReply({ calls: [{ id: "call-1", name: "tool", arguments: "{}" }] });
    }
    return undefined;
  },
});
```

Reply builders (protocol fixtures, still rendered by the toolkit):

| Builder | Protocol moment |
| :-- | :-- |
| `textReply(text)` | Assistant text + `finish_reason: stop` |
| `reasoningReply({ reasoning, text })` | `reasoning_content` delta then text |
| `toolCallReply({ calls })` | `tool_calls` deltas + `finish_reason: tool_calls` |
| `toolResultReply(text)` | Text turn after a tool result |
| `imageReply({ text, base64, mediaType })` | Multipart text + `image_url` data URL |
| `midStreamErrorReply({ text, error })` | Text then an SSE error cut without `[DONE]` |
| `pacedTextReply({ chunks, delayMs })` | Stream kept alive between chunks |
| `scriptedReply(steps)` | Explicit steps escape hatch |

Each builder returns a `ChatReply` (`{ steps, json?, model? }`). `json` is the
content of the non-streaming rendering; it is derived from the steps when absent.
Spread a reply to override it: `{ ...toolCallReply(...), json: "final text" }`.

Non-chat operations are responders returning an `OperationReply` envelope
(`{ status?, headers?, body }`): `embeddingsResponse` (pass the consumer's
`dimensions`), `rerankResponse` (empty ranking by default, explicit `results`
allowed), `decisionsResponse` (first declared criterion, uniform probabilities),
`speechResponse` (deterministic WAV). `deterministicEmbedding(text, dimensions)`
and `deterministicWav(input)` are exported for exact fixtures.

Any request without a non-empty `Authorization` header is answered `401`. A
scenario can override that with `authorize(headers)`.

## MSW (in-process social unit tests)

```ts
import { setupServer } from "msw/node";
import { scenario } from "./my-scenario";

const server = setupServer(...scenario.handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

The handlers are bound to that scenario instance: its responders, its recorded
requests. Point the application at any URL (the handlers match the
`/v1/*` and health paths on any origin); the real Gateway URL is irrelevant.

## HTTP server (E2E and cross-process tests)

```ts
import { startGatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import { scenario } from "./my-scenario";

const server = await startGatewayServer(scenario, { port: 4001 });
// server.url -> "http://127.0.0.1:4001", server.port -> bound port
await server.close();
```

Omit `port` for an ephemeral port (per-test servers). `close()` cancels in-flight
paced streams (including their timers), destroys the open responses and resolves
when the server has released its resources; it is idempotent. A client that
disconnects mid-stream also releases that stream's timers. The MSW handlers and
the server answer byte-identically because both render the same `ChatReply`.

The canonical idempotent `ensureMockGateway`/`stopMockGateway` strategy (probe a
shared port and reuse a live mock across processes) belongs to the consumer, not
to the toolkit.

## Recorded requests

```ts
scenario.requests; // { method, path, headers, body }[] — body parsed when JSON
scenario.reset();  // clears THIS instance's requests only
```

There is no snapshot API and no global state: tool continuations derive from the
request history, and each scenario instance records only its own traffic. That is
what lets tests run concurrently.

## Errors

Unsupported requests never succeed silently:

| Situation | Response |
| :-- | :-- |
| Unknown route | `404` `not_found` |
| Chat responder returns `undefined` | `422` `unsupported_model` |
| No responder for an operation | `422` `unsupported_operation` |
| Responder throws `GatewayScenarioError` | its `status` and `type` |
| Invalid configuration (non-boolean authorizer, malformed reply) | `500` `invalid_scenario_configuration` |
| Responder throws another error | `500` `scenario_error` |

## Development

```bash
pnpm --filter @ai-chatbot/model-gateway-testing test:unit
pnpm --filter @ai-chatbot/model-gateway-testing type:check
pnpm --filter @ai-chatbot/model-gateway-testing lint
```

The package tests cover protocol serialization, MSW/server parity, per-instance
isolation, explicit errors, tool continuation without counters, and stream/resource
release on close and on client disconnect. `tests/jsdom-import.test.ts` locks the
jsdom guarantee of the main entry.

The package is registered explicitly in `pnpm-workspace.yaml` (`packages/model-gateway/js`)
because the `packages/*` glob only matches one level.
