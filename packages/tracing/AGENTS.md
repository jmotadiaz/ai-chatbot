# Agent Instructions — tracing

Shared observability library. Provides AI SDK `LanguageModelV3Middleware` to capture LLM call traces (prompts, responses, tool calls, token usage) and writes them to disk as JSONL. Enabled via `TRACE_ENABLED=1`.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Public API barrel |
| `src/types.ts` | Core types: `TraceEvent`, `TraceRecord`, `TraceSink`, `TracePhase` |
| `src/model-middleware.ts` | AI SDK middleware — intercepts `doGenerate`/`doStream` |
| `src/sink.ts` | `FileTraceSink` — buffered JSONL writer |
| `src/sink-registry.ts` | Ref-counted sink per `runId` — keeps a run traced past the request that opened it |
| `src/context.ts` | `AsyncLocalStorage`-based trace context propagation |

## Sink Lifetime

A sink is owned by its run, not by a request. Request handlers `acquireTraceSink` /
`releaseTraceSink`; work that outlives the response — a detached agent turn that
keeps calling tools after the browser disconnects — takes its own ref with
`retainTraceSink(runId)` and calls the returned release when the turn ends. The
last release flushes and closes. Writes after that are dropped silently, so a
missing ref shows up as a trace that stops mid-run.
