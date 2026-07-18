# Agent Instructions — tracing

Shared observability library. Provides AI SDK `LanguageModelV3Middleware` to capture LLM call traces (prompts, responses, tool calls, token usage) and writes them to disk as JSONL. Enabled via `TRACE_ENABLED=1`.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Public API barrel |
| `src/types.ts` | Core types: `TraceEvent`, `TraceRecord`, `TraceSink`, `TracePhase` |
| `src/model-middleware.ts` | AI SDK middleware — intercepts `doGenerate`/`doStream` |
| `src/sink.ts` | `FileTraceSink` — buffered JSONL writer |
| `src/context.ts` | `AsyncLocalStorage`-based trace context propagation |
