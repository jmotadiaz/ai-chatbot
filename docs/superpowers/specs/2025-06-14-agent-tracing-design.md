# Agent Tracing — Design Spec

**Date**: 2025-06-14
**Status**: Approved

## Overview

Implement app-wide structured tracing as a standalone feature (`lib/features/tracing/`), decoupled from AI infrastructure (`lib/infrastructure/ai/tracing/`) and evaluations (`tests/evals/`). Covers 3 layers: worker process (Pi), bridge (API route + worker client + translator), and client (server actions + browser hook).

## Architecture

```
lib/features/tracing/
├── types.ts            # TraceEvent, LogLevel, TraceLayer
├── context.ts          # AsyncLocalStorage (runId, sessionId, getTraceLogger)
├── logger.ts           # TraceLogger class (info, warn, error, startTimer)
├── sink.ts             # FileTraceSink (buffered NDJSON writer)
├── index.ts            # Barrel + isTracingEnabled() → TRACE_ENABLED=1
└── inspector.ts        # CLI: list, show, errors, layer
```

- **Output directory**: `traces/{runId}.ndjson` (configurable via `TRACE_DIR` env var)
- **Gate**: `TRACE_ENABLED=1` — when off, all logging is noop
- **Correlation**: All 3 layers share the same `runId` (UUID). Bridge creates it. Worker receives it via JSON-RPC params. Client sends it via dedicated trace endpoint.

## Data Model

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";
type TraceLayer = "worker" | "bridge" | "client";

interface TraceEvent {
  ts: string;           // ISO 8601 timestamp
  runId: string;        // UUID correlating all layers
  layer: TraceLayer;    // which system layer
  sessionId?: string;   // coding agent session ID
  level: LogLevel;
  event: string;        // free-form: "rpc.request", "sse.translate", "stream.error"
  durationMs?: number;  // for paired start/end events via startTimer()
  payload: unknown;     // arbitrary structured data
}
```

## Components

### FileTraceSink (`sink.ts`)

- Writes NDJSON (one JSON object per line) to `traces/{runId}.ndjson`
- Buffered: flushes every 20 events or 5 seconds (interval timer with `unref()`)
- `appendFile` for each flush batch
- Single file per `runId` — multiple `FileTraceSink` instances in different processes write to the same file via `appendFile`

### TraceContext (`context.ts`)

- `AsyncLocalStorage<TraceContext>` holds `runId`, `sessionId`
- `runWithTraceContext(ctx, fn)` — wraps request handler in API route
- `getTraceLogger(layer)` — returns a `TraceLogger` scoped to the current context
- `getTraceContext()` — raw context accessor

### TraceLogger (`logger.ts`)

```typescript
class TraceLogger {
  // Core methods
  debug(event: string, payload?: unknown): void
  info(event: string, payload?: unknown): void
  warn(event: string, payload?: unknown): void
  error(event: string, payload?: unknown): void

  // Timing: returns stop() that logs {event}_end with durationMs
  startTimer(event: string, payload?: unknown): () => void
}
```

- When `isTracingEnabled()` is false, all methods are noops
- `startTimer` usage pattern: `const stop = logger.startTimer("rpc.call"); await work(); stop();`

## Layer Integration

### Layer 1: Worker (`lib/agent-code/`)

Worker is a separate Node.js process. It receives `runId` via JSON-RPC params (added by bridge).

**Files to modify**:
- `worker.ts` — initialize TraceLogger per request
- `rpc-server.ts` — log method calls, params, results, timings
- `session-manager.ts` — log session lifecycle (create/dispose), Pi SDK events, stream errors

**Key logging points**:
- RPC method received → `info("rpc.request", { method, params })`
- RPC response sent → `startTimer → stop` (pairs with request)
- Session created/disposed → `info("session.create"/"session.dispose")`
- Pi event emitted → `debug("pi.event", { type, payload })`
- Stream error → `error("stream.error", { message, stack })`

### Layer 2: Bridge (`app/(chat)/api/agent/code/route.ts`)

API route creates `runId`, wraps handler in `runWithTraceContext()`.

**Files to modify**:
- `app/(chat)/api/agent/code/route.ts` — main trace points
- `lib/features/agent-code/worker-client.ts` — fetch + RPC logging
- `lib/features/agent-code/pi-to-agui-translator.ts` — event translation logging

**Key logging points (route.ts)**:
- Request start → `info("request.start", { threadId, sessionId, project, modelId, messageCount })`
- DB session lookup → `info("db.lookup", { found, sessionId })`
- Model mapping → `info("model.mapping", { from, to })`
- Worker initialized → `startTimer("worker.initialize") → stop`
- Worker sendPrompt → `startTimer("worker.sendPrompt") → stop`
- Each NDJSON line parsed → `debug("stream.event", { piType, aguiType, payload })`
- **Malformed NDJSON line (currently silent!)** → `warn("stream.malformed", { line })`
- Stream error → `error("stream.error", { message, stack })`
- Stream close → `info("stream.close")`

**Key logging points (worker-client.ts)**:
- Fetch call → `startTimer("fetch") → stop` with status, URL, method
- RPC error → `error("rpc.error", { code, message })`

**Key logging points (pi-to-agui-translator.ts)**:
- Event translation → `debug("translate", { piType, aguiType })`

### Layer 3: Client

**Server actions** (`lib/features/agent-code/actions.ts`):
- Each action logs invocation and result
- `info("action.call", { action, params })` / `startTimer → stop`

**Browser hook** (`lib/features/agent-code/hooks/use-coding-agent.ts`):
- Adds `POST /api/agent/code/trace` endpoint that receives client-side events and appends them to the trace file
- Events: `sendMessage`, `event.received`, `run.failed`, `run.finalized`
- The trace endpoint writes using the same `runId` so events are interleaved in the NDJSON

## Trace Analyzer Skill Extension

Extend `.agents/skills/trace-analyzer/SKILL.md` with new analysis capabilities:

### New CLI commands via `lib/features/tracing/inspector.ts`:

```bash
npx tsx lib/features/tracing/inspector.ts list              # list recent trace files
npx tsx lib/features/tracing/inspector.ts show <runId>      # all events chronologically
npx tsx lib/features/tracing/inspector.ts errors <runId>    # only error/warn events
npx tsx lib/features/tracing/inspector.ts layer <L> <runId> # worker|bridge|client only
npx tsx lib/features/tracing/inspector.ts stats <runId>     # event counts, durations, errors by layer
```

### Skill additions:
- New trigger: "analyze coding agent trace", "debug agent", "agent trace", "coding agent logs"
- Workflow: use inspector commands to pinpoint failures in the full request lifecycle
- Common patterns: worker unreachable, malformed NDJSON, session not found, model mapping errors

## Cross-Process Write Strategy

The worker (`lib/agent-code/`) is a separate `tsx` process. It CAN import from `lib/features/tracing/` directly — same project, same TypeScript, compiled by tsx.

Both processes (Next.js bridge + worker) write to the same `traces/{runId}.ndjson`:

1. **Bridge** (Next.js API route) creates the `runId`, opens the sink (truncates or creates the file), writes bridge events.
2. **Worker** receives `runId` via JSON-RPC params. Creates its own `FileTraceSink({ truncate: false })` — does NOT truncate, only appends. Writes worker events to the same file.
3. Both use `appendFile` → events are interleaved chronologically in the NDJSON.

The sink constructor accepts `{ truncate?: boolean }` controlling whether `open()` truncates the file.

## Implementation Order

1. Create `lib/features/tracing/types.ts`, `sink.ts`, `context.ts`, `logger.ts`, `index.ts`
2. Create `lib/features/tracing/inspector.ts`
3. Integrate into API route (`app/(chat)/api/agent/code/route.ts`)
4. Integrate into `worker-client.ts` and `pi-to-agui-translator.ts`
5. Integrate into worker process (`lib/agent-code/worker.ts`, `rpc-server.ts`, `session-manager.ts`)
6. Integrate into server actions (`lib/features/agent-code/actions.ts`)
7. Add client trace endpoint (`app/(chat)/api/agent/code/trace/route.ts`)
8. Integrate into browser hook (`use-coding-agent.ts`)
9. Extend trace-analyzer skill
10. Run lint + build to verify
