# Coding Agent Worker Wrapper — Resilience & Reconnect Design

## 1. Context and Goal

The Coding Agent integration (`docs/superpowers/specs/2026-06-14-coding-agent-design.md`) is a three-layer system: a Next.js BFF, a standalone Node.js Worker that wraps the Pi SDK (`@earendil-works/pi-coding-agent`), and a frontend that consumes AG-UI events over SSE.

Today the worker streams Pi events through a single `ReadableStream` per `sendPrompt` (`packages/coding-agent/session-manager.ts:206-253`) and the BFF pipes that stream to the client (`packages/chatbot/app/(chat)/api/agent/code/route.ts:155-220`). Two problems exist:

1. **No disconnect handling.** When the client closes the SSE connection, the BFF calls `reader.cancel()` on its end, but the worker's `runtime.session.subscribe(...)` callback stays attached to Pi's event bus. The per-prompt `unsubscribe()` is only invoked when the prompt Promise resolves. The worker's `req.on('close')` is not wired, so listeners leak and the `ReadableStream` controller is never explicitly closed.

2. **No reconnection path.** The frontend only knows `HttpAgent.runAgent`. If the user closes the tab and returns while a long-running prompt is in flight, they either miss every event after the disconnect or have to send a new prompt.

This design adds:

- A **clean disconnect path** that releases per-client intermediaries while leaving the Pi agent running in the background (the "Regla de Oro" from the brief).
- A **reconnection path** using AG-UI's `connectAgent()` so the client can resume observation of an in-flight run, delivered as a snapshot followed by live deltas.
- A **shared in-memory subscription model** in the worker so that multiple clients can observe the same session without re-subscribing to Pi's event bus.

Out of scope: persistent storage of partial runs in a database. Snapshot is reconstructed from Pi's `session.messages` (the source of truth on disk) plus an in-memory `inFlightTools` buffer for in-flight tool calls.

## 2. Key Decisions

| Topic | Decision |
|---|---|
| Client-side reconnect protocol | Custom `ConnectableHttpAgent extends AbstractAgent` that overrides `connect()` and POSTs to a new BFF endpoint. Reuses the same translator pipeline as `run`. |
| Reconnect wire | New BFF route `POST /api/agent/code/connect`; new worker JSON-RPC method `connectToSession`. |
| Worker-side subscriptions | One `runtime.session.subscribe(...)` per Pi session, fanning out to N `SubscriberHandle`s. New clients subscribe a handle; disconnected clients have their handle removed. |
| Disconnect semantics | On client close, BFF cancels the worker NDJSON reader; worker `req.on('close')` removes the client's `SubscriberHandle` and closes its `ReadableStream` controller. The Pi `prompt()` Promise is **not** aborted. |
| Snapshot source | `session-manager.getSessionMessages()` (already implemented, used by `GET /api/agent/code/[sessionId]/messages`) plus `inFlightTools: Map<contentIndex, { toolCallId, name, argsSoFar }>`. |
| Concurrency | `contentIndex` → `toolCallId` mapping is the same map used by the translator; reconnect prepends partial tool calls idempotently. |
| Cancel-on-demand | New endpoint `POST /api/agent/code/cancel` for explicit user-initiated cancellation (aborts the Pi prompt). Distinct from passive disconnect. |
| Client detection of live run | Client calls `GET /api/agent/code/sessions/[sessionId]/status` on mount; if `running`, calls `connectAgent`; else waits for user input. |

## 3. Architecture

```
┌──────────────────────┐         ┌─────────────────────────┐         ┌──────────────────────┐
│  Frontend            │         │  BFF (Next.js)          │         │  Worker (Node)       │
│  (React)             │         │  app/(chat)/api/agent/  │         │  packages/coding-    │
│                      │         │  code/...               │         │  agent/              │
└──────────────────────┘         └─────────────────────────┘         └──────────────────────┘
        │                                  │                                     │
        │  ① on mount (always)             │                                     │
        │  GET /api/agent/code/sessions/   │                                     │
        │      [sessionId]/status          │                                     │
        │ ───────────────────────────────► │  POST /rpc getSessionStatus         │
        │                                  │ ──────────────────────────────────► │
        │                                  │ ◄────────────────────────────────── │
        │  { running, runId? }             │                                     │
        │ ◄─────────────────────────────── │                                     │
        │                                  │                                     │
        ├──────────────────────────────────┴─────────────────────────────────────┤
        │                            DECISION                                  │
        ├──────────────────────────────────┬─────────────────────────────────────┤
        │                                  │                                     │
   running === false                 running === true                          │
        │                                  │                                     │
        │  ② user sends prompt            │  ② reconnect to live run            │
        │  ConnectableHttpAgent.run()     │  ConnectableHttpAgent.connect()     │
        │                                  │                                     │
        │  POST /api/agent/code           │  POST /api/agent/code/connect       │
        │ ───────────────────────────────►│ ──────────────────────────────────► │
        │                                  │  POST /rpc sendPrompt               │  OR   POST /rpc connectToSession
        │                                  │                                     │       │
        │                                  │  PiToAguiTranslator (translate live)│       ├─ snapshot
        │                                  │ ◄────── NDJSON stream ──────────────│       ├─ subscribe handle
        │  SSE (AG-UI events)             │                                     │       └─ live stream
        │ ◄═══════════════════════════════│                                     │              │
        │                                  │                                     │              │
        │                                  │                                     │       (one runtime.session.subscribe
        │                                  │                                     │        per session, fan-out to N handles)
        │                                  │                                     │              │
        │                                  │                                     │       req.on('close') per request ──┐
        │                                  │                                     │       → remove SubscriberHandle    │
        │                                  │                                     │       → close ReadableStream ctrl  │
        │                                  │                                     │       → keep prompt() alive  ──────┘
        │                                  │                                     │
        │  ③ user clicks "Stop" (optional) │                                     │
        │  POST /api/agent/code/cancel     │                                     │
        │ ───────────────────────────────► │  POST /rpc cancelRun                │
        │                                  │ ──────────────────────────────────► │
        │                                  │                                     │  abortController.abort()
        │                                  │                                     │  → prompt() rejects → cleanup
```

**Steps in order:**

1. **On mount, always:** the client calls `GET /api/agent/code/sessions/[sessionId]/status`. The BFF forwards to `POST /rpc getSessionStatus` on the worker, which returns `{ running, runId? }` from `session-manager.getSessionStatus()`.
2. **Branch on the response:** if `running === false`, the client waits for the user to send a prompt; when it does, `ConnectableHttpAgent.run()` is used (left branch). If `running === true`, the client calls `ConnectableHttpAgent.connect()` to resume observation of the in-flight run (right branch).
3. **Cancellation (optional):** the user can click "Stop", which calls `POST /api/agent/code/cancel`. The BFF forwards to `POST /rpc cancelRun`, which calls `abortController.abort()` on the active `runtime.session.prompt()`. This is **distinct** from a passive disconnect (closing the tab, network drop), which leaves the prompt running.

### Boundaries (single responsibility)

| Module | Responsibility |
|---|---|
| `packages/coding-agent/session-manager.ts` | Owns the in-memory `Map<sessionId, SessionEntry>`. Adds `connectToSession()`, `cancelRun()`, `inFlightTools` / `inFlightSteps` per entry, and a per-session `listeners: Set<SubscriberHandle>`. |
| `packages/coding-agent/rpc-server.ts` | Routes `connectToSession` and `cancelRun` JSON-RPC methods. |
| `packages/coding-agent/worker.ts` | Wires `req.on('close')` to a per-request `onClientDisconnect` callback supplied by the RPC handler. |
| `packages/chatbot/app/(chat)/api/agent/code/route.ts` | Existing run endpoint. Adds `req.signal` handling to cancel the worker stream on client abort. |
| `packages/chatbot/app/(chat)/api/agent/code/connect/route.ts` | **New.** POST handler that proxies `connectToSession`. |
| `packages/chatbot/app/(chat)/api/agent/code/cancel/route.ts` | **New.** POST handler that proxies `cancelRun`. |
| `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/status/route.ts` | **New.** GET handler returning `{ running, runId? }`. |
| `packages/chatbot/lib/features/code/connectable-http-agent.ts` | **New.** `ConnectableHttpAgent extends AbstractAgent` overriding `run()` and `connect()`. |
| `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` | Calls `GET /status` on mount, chooses `connectAgent` vs wait, and reconnects on SSE drop. |
| `packages/chatbot/lib/features/code/worker-client.ts` | Adds `connectToSession()` and `cancelRun()` JSON-RPC wrappers. |
| `packages/chatbot/lib/features/code/pi-to-agui-translator.ts` | **No changes** for the run path. New `translateSnapshot()` helper for the reconnect path. |

## 4. Components and Modules

### 4.1 Worker — `session-manager.ts`

`SessionEntry` evolves:

```ts
interface SessionEntry {
  sessionId: string;
  piSessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  listeners: Set<SubscriberHandle>;
  inFlightTools: Map<number, {
    toolCallId: string;
    name: string;
    argsSoFar: string;
    parentMessageId?: string;
  }>;
  inFlightSteps: Map<string, string>; // toolCallId -> stepName
  activeRunId: string | null;
  activeAbortController: AbortController | null;
}

interface SubscriberHandle {
  id: string;
  enqueue: (line: string) => void;
  close: () => void;
}
```

A single `runtime.session.subscribe(handler)` is installed the first time a session is touched. `handler` iterates `entry.listeners` and calls `enqueue(JSON.stringify(event) + "\n")` on each. The same handler also updates `inFlightTools` / `inFlightSteps` as a side effect.

#### `sendPrompt(sessionId, prompt)` (modified)

1. If `entry.activeAbortController` exists, reject (a run is already in flight).
2. Create a new `AbortController` and store it.
3. For each new subscriber (this call), create a `SubscriberHandle` whose `enqueue` writes to the subscriber's `ReadableStreamDefaultController`.
4. The new `runtime.session.subscribe(handler)` is **not** created here — it was created on first touch.
5. `runtime.session.prompt(prompt, { signal: activeAbortController.signal })` is invoked.
6. On resolve/reject of the prompt Promise, close all subscriber controllers and clear the abort controller.

#### `connectToSession(sessionId)` (new)

1. Validate session exists in memory (or load from disk via `loadSessionFromDisk`).
2. Compute snapshot:
   - `messages = await getSessionMessages(sessionId)` — same code as today.
   - `inFlight` = array derived from `entry.inFlightTools`, in the form `{ toolCallId, name, argsSoFar, parentMessageId }`.
3. Return a `ReadableStream<Uint8Array>` whose `start`:
   1. Enqueues a header line `{"type":"snapshot","messages":[...], "inFlight":[...]}`.
   2. Registers a new `SubscriberHandle` in `entry.listeners`.
   3. On `req.on('close')` from the BFF, removes the handle.
4. The handle's `enqueue` simply writes the JSON line of the live event.

#### `cancelRun(sessionId)` (new)

1. If `entry.activeAbortController` exists, call `abortController.abort()`.
2. Wait for the prompt Promise to settle (the subscriber handles will close themselves via the existing resolve/reject path).
3. Return `{ cancelled: true }`.

#### `getSessionStatus(sessionId)` (new)

1. If `entry.activeAbortController` is non-null, return `{ running: true, runId: entry.activeRunId }`.
2. Else return `{ running: false }`.

### 4.2 Worker — `rpc-server.ts`

New methods:

```ts
case "connectToSession": {
  const { sessionId } = params as { sessionId: string };
  const stream = await connectToSession(sessionId);
  // Stream the same way as sendPrompt (NDJSON, content-type application/x-ndjson).
}

case "cancelRun": {
  const { sessionId } = params as { sessionId: string };
  const result = await cancelRun(sessionId);
}

case "getSessionStatus": {
  const { sessionId } = params as { sessionId: string };
  const result = await getSessionStatus(sessionId);
}
```

### 4.3 Worker — `worker.ts`

The HTTP server passes `req` to the RPC handler. For streaming methods (`sendPrompt`, `connectToSession`) the handler registers a close listener:

```ts
req.on("close", () => {
  // De-register the SubscriberHandle that was created for this request.
  removeSubscriberByRequest(req);
});
```

`removeSubscriberByRequest` is keyed by an ID stamped on the request when the handle is created (a `WeakMap<IncomingMessage, SubscriberHandle>` works).

### 4.4 BFF — new route: `POST /api/agent/code/connect`

```ts
export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  // ... same context/forwardedProps extraction as /api/agent/code ...
  const client = new WorkerClient();
  await client.initializeSession({ ... });
  const workerStream = await client.connectToSession({ sessionId });
  // Wrap the NDJSON stream into an AG-UI SSE stream, but:
  //   - First line is { type: "MESSAGES_SNAPSHOT", messages: [...], inFlight: [...] }.
  //   - Subsequent lines are translated by PiToAguiTranslator (new instance).
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", ... } });
});
```

The new translator instance is required: it is in its initial state and only needs to translate live deltas, not replay history. Snapshot handling is done by emitting a single `MESSAGES_SNAPSHOT` AG-UI event at the start of the stream (the AG-UI client's `HttpAgent` already understands this event via `onMessagesSnapshotEvent`).

**In-flight tool calls are not part of the snapshot payload.** After the `MESSAGES_SNAPSHOT` event, the route iterates the `inFlight` array and emits `TOOL_CALL_START` and (if `argsSoFar` non-empty) a `TOOL_CALL_ARGS` event with the accumulated delta. The translator does **not** see these — they bypass the translator because they are already in AG-UI form. The translator only handles live events from this point on.

### 4.5 BFF — new route: `POST /api/agent/code/cancel`

```ts
export const POST = withAuth(async (user, req) => {
  const { sessionId } = await req.json();
  const client = new WorkerClient();
  await client.cancelRun({ sessionId });
  return Response.json({ ok: true });
});
```

### 4.6 BFF — new route: `GET /api/agent/code/sessions/[sessionId]/status`

```ts
export const GET = withAuth(async (user, { params }) => {
  const { sessionId } = params;
  const client = new WorkerClient();
  const result = await client.getSessionStatus({ sessionId });
  return Response.json(result);
});
```

### 4.7 Frontend — `connectable-http-agent.ts`

```ts
import {
  AbstractAgent,
  parseSSEStream,
  type RunAgentInput,
  type BaseEvent,
} from "@ag-ui/client";

export class ConnectableHttpAgent extends AbstractAgent {
  private runUrl = "/api/agent/code";
  private connectUrl = "/api/agent/code/connect";

  constructor(config: {
    url?: string;
    threadId: string;
    initialMessages?: Message[];
  }) {
    super({ ...config });
    if (config.url) {
      this.runUrl = `${config.url}/run`;
      this.connectUrl = `${config.url}/connect`;
    }
  }

  run(input: RunAgentInput) {
    return runHttp(this.runUrl, input);
  }

  connect(input: RunAgentInput) {
    return runHttp(this.connectUrl, input);
  }
}
```

`runHttp` is a local helper that does `fetch(url, { method: "POST", body: JSON.stringify(input) })` and maps the SSE response through `parseSSEStream` (already exported by `@ag-ui/client`).

`connectAgent(...)` is inherited from `AbstractAgent` and dispatches to `connect(input)` — no extra work needed.

### 4.8 Frontend — `use-coding-agent.ts` lifecycle

```
mount(sessionId, project, modelId)
  ├─ create ConnectableHttpAgent with initialMessages from props
  ├─ call GET /api/agent/code/sessions/[sessionId]/status
  │     ├─ if running: agent.connectAgent({ context, runId, ... })
  │     └─ if not:    no-op
  └─ subscribe to agent events as today

sendMessage(content)  // user typed
  ├─ agent.addMessage({ role: "user", content })
  └─ agent.runAgent({ runId, context, ... })

window.addEventListener("offline")  // or EventSource.onerror
  └─ if agent.isRunning: agent.connectAgent({ runId, ... })
```

`EventSource.onerror` is not directly observable on the `HttpAgent`; instead, the SSE stream is consumed by the AG-UI RxJS pipeline internally. The reconnect trigger is `onRunFailed` (with `error.name === "AbortError"` or `error.message === "Fetch is aborted"`) which is the AG-UI client's signal that the underlying `fetch` was aborted. On such an event, the hook calls `connectAgent` if `agent.isRunning` was true.

## 5. Data Flow

### 5.1 Run (existing, unchanged)

1. User submits prompt in the chat view.
2. `use-coding-agent.sendMessage` calls `agent.addMessage` + `agent.runAgent`.
3. `ConnectableHttpAgent.run` POSTs to `/api/agent/code`.
4. BFF initializes the session, calls `worker.sendPrompt`, pipes NDJSON → SSE.
5. AG-UI events arrive at the agent, fan out to subscribers.

### 5.2 Disconnect (new)

1. User closes the tab / browser drops the connection.
2. The Next.js route handler's `req.signal` fires `abort`.
3. The route handler calls `workerStream.cancel()` on the reader returned by `client.sendPrompt`.
4. The worker's `IncomingMessage` for that RPC call emits `close`.
5. The worker removes the `SubscriberHandle` keyed by that request.
6. The Pi `prompt()` Promise continues to run. The `runtime.session.subscribe` callback is not removed.
7. Any subsequent Pi events update `entry.inFlightTools` / `entry.inFlightSteps` but have nowhere to enqueue (no listeners).

### 5.3 Reconnect (new)

1. User returns to the tab. The page mounts, `use-coding-agent` runs.
2. `GET /api/agent/code/sessions/[sessionId]/status` returns `{ running: true, runId: "..." }`.
3. `agent.connectAgent({ runId, context, ... })` POSTs to `/api/agent/code/connect`.
4. BFF calls `worker.connectToSession({ sessionId })`.
5. Worker emits the snapshot header. The snapshot contains the message history **without** the tool calls that are still in-flight; those are listed separately in `inFlight` so they can be replayed as live events.
6. BFF translates it:
   - Sends `MESSAGES_SNAPSHOT` AG-UI event with `event.messages = snapshot.messages`.
   - For each `inFlight` entry: emits `TOOL_CALL_START` (with the correct `parentMessageId`) and (if args present) a single `TOOL_CALL_ARGS` delta equal to the accumulated JSON args.
   - This avoids duplicating the in-flight tool calls: they are not in the snapshot, so AG-UI creates them exactly once from the live events.
7. BFF registers a new `SubscriberHandle` in the worker for this request.
8. Live Pi events flow through the existing single `runtime.session.subscribe` callback, fan out to all current subscribers (this reconnect is the only one right now).
9. The translator (fresh instance) translates deltas.
10. When the prompt Promise resolves, the worker closes all subscriber controllers and clears the active run. The BFF stream closes; the AG-UI client receives `RUN_FINISHED`.

## 6. Interfaces and Contracts

### 6.1 Worker JSON-RPC

| Method | Params | Returns |
|---|---|---|
| `initializeSession` | (unchanged) | (unchanged) |
| `sendPrompt` | (unchanged) | NDJSON stream of Pi events |
| `connectToSession` | `{ sessionId }` | NDJSON stream: first line is `{"type":"snapshot","messages":[...],"inFlight":[...]}`, subsequent lines are raw Pi events |
| `cancelRun` | `{ sessionId }` | `{ cancelled: boolean }` |
| `getSessionStatus` | `{ sessionId }` | `{ running: boolean, runId?: string }` |
| `getSessionMessages` | (unchanged) | (unchanged) |
| `getAvailableModels` | (unchanged) | (unchanged) |
| `disposeSession` | (unchanged) | (unchanged) |

### 6.2 BFF HTTP routes

| Route | Method | Body | Response |
|---|---|---|---|
| `/api/agent/code` | POST | (existing) | `text/event-stream` (AG-UI) |
| `/api/agent/code/connect` | POST | `{ threadId, runId, project, sessionId, modelId, context, forwardedProps, messages }` | `text/event-stream` (AG-UI; first event is `MESSAGES_SNAPSHOT`) |
| `/api/agent/code/cancel` | POST | `{ sessionId }` | `{ ok: true }` |
| `/api/agent/code/sessions/[sessionId]/status` | GET | — | `{ running: boolean, runId?: string }` |

### 6.3 AG-UI `MESSAGES_SNAPSHOT` event payload (BFF → client)

```ts
{
  type: "MESSAGES_SNAPSHOT",
  messages: Message[],                 // from getSessionMessages
  timestamp: number,
}
```

`inFlight` is **not** sent as part of the snapshot payload. It is emitted as separate `TOOL_CALL_START` / `TOOL_CALL_ARGS` events immediately after the snapshot, before any live deltas, so the client state machine sees the in-flight tools as "open" and ready to receive further args/end/result events.

### 6.4 Cancellation vs. disconnect (semantics)

| Action | Effect on Pi prompt | Effect on listeners |
|---|---|---|
| User closes tab / reload / network drop | None (Pi keeps running) | This client's handle is removed |
| User clicks "Stop" button → `POST /api/agent/code/cancel` | `AbortController.abort()` | All handles are closed, then removed |

## 7. Concurrency & contentIndex Mapping

Pi emits `toolcall_start` / `toolcall_delta` / `toolcall_end` events with a `contentIndex` that may be shared across parallel tool calls within a single assistant message. The `PiToAguiTranslator` (`pi-to-agui-translator.ts:67`) already maintains an `activeToolCalls: Map<number, ActiveToolCall>` for the duration of a single message.

The worker now also maintains this map in `entry.inFlightTools` so that:

1. **During the run:** every `toolcall_start` populates `entry.inFlightTools.set(contentIndex, { toolCallId, name, ... })`. The single `runtime.session.subscribe` callback reads from it to enrich the live NDJSON line with the resolved `toolCallId` (or the translator can do the same on the BFF side — both work, but enriching on the BFF side keeps the wire simple).

2. **On reconnect:** the BFF reads the in-flight map and emits `TOOL_CALL_START` events with the `toolCallId` it finds there. From that point on, the live events arriving on the same `contentIndex` use the same `toolCallId` (the worker has not changed it), so the client state machine is consistent.

3. **Cleanup:** `tool_execution_end` removes the matching entry from `entry.inFlightTools` by `toolCallId`. `message_end` does **not** clear the in-flight map, because the LLM may finish emitting the assistant message while one or more tools are still executing; keeping the entries alive until `tool_execution_end` ensures a reconnect during tool execution still sees the in-flight tools in the snapshot.

## 8. Memory & GC Guarantees

The "Regla de Oro" requires that the worker releases intermediaries to avoid leaks while the agent keeps running. Concretely:

- **One** `runtime.session.subscribe` per Pi session, fanning out to N handles. Removing a handle does not unsubscribe from Pi.
- The `SubscriberHandle` holds a reference to the `ReadableStreamDefaultController`. When the BFF cancels the stream, the controller is `close()`d and the handle is removed from the set, making both eligible for GC.
- The translator on the BFF side is local to the route handler invocation; it is released as soon as the SSE stream closes.
- The `inFlightTools` map is bounded by the number of tool calls in the current assistant message (typically < 10). It is cleared on `message_end`.
- The active run abort controller is replaced on every `sendPrompt`. A reference to the previous one is dropped as soon as the new one is installed, allowing the old one to be GC'd.

## 9. Error Handling

| Scenario | Behavior |
|---|---|
| Worker down on `connectToSession` | BFF returns 502; client retries with exponential backoff (1s, 2s, 5s, then give up). |
| Session not found on connect | Worker returns empty snapshot (messages: [], inFlight: []); BFF emits `MESSAGES_SNAPSHOT` then `RUN_FINISHED`. |
| Worker returns 200 but emits no events for 30s | BFF closes the stream; client re-runs `connectAgent`. |
| Client reconnects to a session that already finished | Worker emits snapshot + immediate `RUN_FINISHED`. |
| `runtime.session.prompt` rejects after disconnect | The error is logged on the worker; if there are still active subscribers, a `{"type":"error","message":...}` NDJSON line is emitted. |
| `req.on('close')` fires after `close()` was already called on the controller | Idempotent: removing a non-existent handle is a no-op. |
| Two clients call `connectToSession` for the same session concurrently | Both get the same snapshot; both attach a `SubscriberHandle`; both receive live deltas. The single `runtime.session.subscribe` callback fans out. |

## 10. Testing

### Unit

- `session-manager.test.ts`:
  - `sendPrompt` registers exactly one `runtime.session.subscribe` even when called multiple times.
  - `connectToSession` emits snapshot + live deltas in correct order, with `inFlight` tools represented.
  - `cancelRun` aborts the active `AbortController` and resolves the prompt Promise.
  - `getSessionStatus` returns `running: true` while a prompt is in flight, `false` after.
- `pi-to-agui-translator.test.ts`:
  - `translateSnapshot` (new helper) emits `MESSAGES_SNAPSHOT` correctly.
  - `inFlight` array is converted to `TOOL_CALL_START` + optional `TOOL_CALL_ARGS` deltas.
- `connectable-http-agent.test.ts`:
  - `connect()` POSTs to the right URL with the right body.
  - `connectAgent()` calls `connect(input)` and resolves the AG-UI RxJS pipeline.

### E2E (Playwright)

- `tests/e2e/agent-code-reconnect.spec.ts`:
  1. Open `/agent/code/[project]/[sessionId]`.
  2. Send a prompt that triggers a long-running tool (e.g., a `bash` sleep).
  3. While the tool is running, simulate a reconnect by aborting the SSE connection (`page.evaluate(() => navigator.serviceWorker.ready...)` or by killing/restarting the Next.js dev process).
  4. Reload the page; assert the `MESSAGES_SNAPSHOT` contains the in-flight tool call.
  5. Wait for `RUN_FINISHED`; assert the final message is present.
- `tests/e2e/agent-code-cancel.spec.ts`:
  1. Send a long-running prompt.
  2. Click "Stop"; assert the SSE stream closes and the worker reports `cancelled: true`.
  3. Assert no further events arrive.
- `tests/e2e/agent-code-status.spec.ts`:
  1. While a prompt runs, `GET /api/agent/code/sessions/[id]/status` returns `running: true`.
  2. After it finishes, the same call returns `running: false`.

### Evals

- Not in scope.

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Reconnect arrives after the run finished, snapshot is empty | Worker checks `entry.activeAbortController`; if null, it still emits an empty snapshot and a `RUN_FINISHED` event. |
| Translator state divergence if a new instance is created on reconnect | The reconnect translator is stateful only for the live deltas; the snapshot is sent as a single AG-UI event. Verified by a unit test that replays a recorded event sequence. |
| BFF is slow to call `workerStream.cancel()` on `req.signal` | The Next.js route handler already wires `req.signal` to `reader.cancel()`; we just route the same signal to also abort the worker stream. |
| Two parallel `connectToSession` requests produce two snapshots out of order | The snapshot is deterministic from `session.messages`; the only "live" data is the `inFlight` map, which is monotonic. Ordering is preserved. |
| Worker restart loses in-memory `inFlightTools` | On startup, the worker does **not** reattach to running runs. The client will see `running: false` on the first reconnect attempt and the user must resend. This is a known limitation; persistent state is out of scope. |
| Memory leak if `req.on('close')` is not fired for a stuck connection | A periodic sweep (every 60s) on the worker removes subscriber handles whose controllers have been `close()`d but were not removed by the close event. |

## 12. Development and Deployment

No new environment variables. The new routes live under existing `/api/agent/code/...` and use the same `withAuth` wrapper, the same `WorkerClient`, the same `PiToAguiTranslator`.

The new files are:

- `packages/chatbot/lib/features/code/connectable-http-agent.ts`
- `packages/chatbot/app/(chat)/api/agent/code/connect/route.ts`
- `packages/chatbot/app/(chat)/api/agent/code/cancel/route.ts`
- `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/status/route.ts`

The modified files are:

- `packages/coding-agent/session-manager.ts` (add `connectToSession`, `cancelRun`, `getSessionStatus`, in-flight maps, single-subscribe fan-out)
- `packages/coding-agent/rpc-server.ts` (add 3 new methods)
- `packages/coding-agent/worker.ts` (wire `req.on('close')` to per-request cleanup)
- `packages/chatbot/lib/features/code/worker-client.ts` (add 3 new wrappers)
- `packages/chatbot/lib/features/code/pi-to-agui-translator.ts` (add `translateSnapshot` helper)
- `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` (use `ConnectableHttpAgent`, call `/status` on mount, reconnect on `onRunFailed`)

## 13. Future Work

- Persist `inFlightTools` to disk so reconnect works across worker restarts.
- Surface a "Stop" button in the chat UI that calls `/api/agent/code/cancel`.
- Add `/api/agent/code/connect` to the worker-stub for E2E coverage that does not need Pi credentials.
- Multi-tenant subscription: if a user reconnects from a different browser, enforce auth + project ownership on the connect endpoint (already covered by `withAuth` + the `getSession` lookup in the BFF).
