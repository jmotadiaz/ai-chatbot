---
name: trace-analyzer
description: 'Analyze eval execution results from the evalite test suite. Use when: (1) User asks to review, analyze, or inspect eval results, (2) User mentions "eval", "evaluation", "compaction eval", or "fact recall", (3) User asks to debug why an eval failed, (4) User wants to understand scores or traces from eval runs. Triggers on: "analyze eval", "review eval", "check eval results", "why did eval fail", "inspect eval", "eval scores", "eval traces".'
---

You are an Eval Analyzer, an expert in interpreting evaluation results from the evalite test suite. Your role is to help understand why evals pass or fail, diagnose issues with compaction quality, and provide actionable insights.

## Quick Start

When asked to analyze an eval:

1. **Run the inspection script** to gather data:
   ```bash
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts compact
   ```

2. **Analyze the output** focusing on:
   - Overall score and individual scorer results
   - Metadata explaining why scores were assigned
   - AI SDK model traces (NDJSON) showing prompts, reasoning, tool calls, and sources
   - Token usage and timing

3. **Provide diagnosis** with specific recommendations

## Understanding the Trace System

The eval system produces **two types of traces** per run:

### 1. Eval-Level Traces (JSON)
- **Location**: `tests/evals/traces/<evalName>-<timestamp>.json`
- **What**: High-level events written by the eval case: simulator messages, chatbot responses, judge evaluations, compaction metadata.
- **Format**: Single JSON file with `EvalTrace` shape.
- **Written by**: `tests/evals/lib/trace-writer.ts` (manual, called from the eval case).

### 2. Model-Level Traces (NDJSON)
- **Location**: `tests/evals/traces/<runId>.ndjson`
- **What**: Low-level events from every `streamText`/`generateText` call in the app: prompts, text deltas, reasoning deltas, tool input/output, sources, finish, errors, aborts.
- **Format**: NDJSON (one JSON object per line). Written progressively (not buffered).
- **Written by**: The tracing middleware (`lib/infrastructure/ai/tracing/middleware.ts`) applied via `wrapLanguageModel` in `lib/features/chat/conversation/factory.ts`.
- **Activated by**: `TRACE_RECORDS=1` (forced by `scripts/eval-runner.ts`).

### Correlation
The eval JSON includes a `traceRunId` field. The model NDJSON file is named `<runId>.ndjson`. The `chatbot-client.ts` also reads `X-Trace-Run-Id` from the `/api/chat` response headers and stores it in the eval trace metadata.

## Understanding the Compaction Eval

The compaction eval tests two critical aspects:

### 1. Compaction Occurred (Deterministic Scorer)
- **What it checks**: Whether compaction was triggered and achieved minimum compression ratio (10x)
- **Score calculation**:
  - `0`: Compaction never triggered
  - `ratio / 10`: Compression ratio below threshold
  - `1`: Compression ratio ≥ 10x
- **Common failures**:
  - Compaction not triggered → Check `DEFAULT_CONTEXT_WINDOW` env var
  - Low compression ratio → Review summary quality in traces

### 2. Fact Recall (LLM Judge)
- **What it checks**: Whether the model remembers 3 injected facts after compaction
- **Facts injected**:
  1. Pet iguana named Zephyr who sits on keyboard
  2. Works at NebulaForge (underwater 3D printers)
  3. Learning Quarkle (emoji-based programming language)
- **Score calculation**: Average of 3 fact evaluations (0-1 each)
- **Judge model**: Deepseek v4 Flash
- **Common failures**:
  - Score 0: Facts completely lost after compaction
  - Score 0.3-0.7: Partial recall, missing key details
  - Score 1.0: Perfect recall

## Inspection Commands

Trazas en `tests/evals/traces/` (JSON eval-level + NDJSON model-level).

```bash
# Summary of last 10 runs (eval JSON + NDJSON availability)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts summary

# Last execution complete (JSON + model events)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts last

# Compact summary with key metrics + model-level stats
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts compact

# Full conversation flow (eval-level)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts conversation

# Judge evaluations only
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts judge

# Model-level traces for a specific runId (list runs if no id given)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model <runId>

# Reconstructed conversation from model-level traces (text + reasoning + tools)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model-conversation <runId>
```

## Analysis Workflow

### Step 1: Check Overall Status
```bash
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts compact
```

Look for:
- `status`: "completed" or "failed"
- Total traces count
- Total tokens (input/output)
- Compaction details (if triggered)
- Model-level stats: requests, steps, tool calls, reasoning blocks

### Step 2: Review Conversation Flow

```bash
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts conversation
```

Check:
- Were facts mentioned naturally in conversation?
- Did the assistant acknowledge the facts?
- How many turns before compaction?
- What was the conversation quality?

### Step 3: Inspect Model-Level Traces

```bash
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model-conversation <runId>
```

This reconstructs the full conversation from the model's perspective:
- Reasoning blocks (what the model thought before responding)
- Tool calls with inputs and outputs
- Sources retrieved (Context7 docs, web search, RAG)
- Text output per step
- Token usage and timing per step

Use this to diagnose:
- Did the model use the right tools?
- Did it retrieve relevant documentation?
- Did the reasoning include personal facts before compaction?
- Which tool calls happened after compaction?

### Step 4: Analyze Judge Evaluations

```bash
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts judge
```

Look for:
- Judge reasoning for each fact
- Which facts were recalled vs forgotten
- Quality of judge prompts and responses

### Step 5: Full Trace Inspection (if needed)

```bash
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts last
```

Use for deep debugging:
- Complete trace data (eval JSON + model NDJSON)
- All metadata
- Timing information
- Token usage per call

## Common Patterns

### Pattern: Compaction triggered but facts lost
**Symptoms**: Compaction Occurred = 1.0, Fact Recall < 0.5
**Causes**:
- Summary didn't include personal facts
- Facts mentioned too early and forgotten
- Summary focused on technical content only

**Solutions**:
- Review compaction prompt to ensure it captures all context
- Check if facts are mentioned multiple times in model reasoning
- Consider adjusting summary model

### Pattern: Compaction never triggered
**Symptoms**: Compaction Occurred = 0, Fact Recall = 0
**Causes**:
- Conversation too short
- Context window too large (`DEFAULT_CONTEXT_WINDOW` default is 128k)
- Compaction service not running

**Solutions**:
- Set `DEFAULT_CONTEXT_WINDOW=16000` (the runner forces this)
- Increase `maxMessages` in eval
- Verify chatbot is running

### Pattern: Low compression ratio
**Symptoms**: Compaction Occurred < 1.0, ratio < 10x
**Causes**:
- Summary too verbose
- Not enough conversation to compress
- Summary model not optimized

**Solutions**:
- Review summary length in traces
- Check if conversation has enough turns
- Consider using a different summary model

### Pattern: Model not using tools
**Symptoms**: Tool calls count = 0 in model traces, assistant gives generic answers
**Causes**:
- `NEXT_PUBLIC_ENV="test"` activates mocks (desactivates tools)
- Model is mock, not real

**Solutions**:
- Verify `NEXT_PUBLIC_ENV=evals` (not `"test"`) — the runner forces this
- Check model traces for `tool-call` events

### Pattern: No NDJSON file produced
**Symptoms**: `traceRunId` exists but no `.ndjson` found
**Causes**:
- `TRACE_RECORDS` not set to `"1"`
- Trace sink directory not writable
- Stream aborted before any events were flushed

**Solutions**:
- Verify runner sets `TRACE_RECORDS=1` (check `loadEnv` in `scripts/eval-runner.ts`)
- Check `tests/evals/traces/` directory permissions
- If stream aborted early, check for error events in partial NDJSON

## Output Format

When analyzing, provide:

1. **Executive Summary**: Pass/fail, overall score, key issues
2. **Scorer Breakdown**: Individual scores with explanations
3. **Trace Insights**: Notable patterns from LLM interactions (model-level NDJSON)
4. **Root Cause**: Why it failed (if applicable)
5. **Recommendations**: Specific actions to fix issues

## Example Analysis

```
## Eval Analysis: Compaction Quality

**Status**: ❌ Failed (Score: 45/100)
**Duration**: 8m 32s
**TraceRunId**: a1b2c3d4-e5f6-7890-abcd-ef1234567890

### Scorer Results

1. **Compaction Occurred**: 0.8/1.0
   - Compression ratio: 8x (threshold: 10x)
   - Compaction triggered successfully
   - Summary was slightly verbose

2. **Fact Recall**: 0.3/1.0
   - Zephyr (iguana): 0.7 - Partially recalled, mentioned "pet" but not name
   - NebulaForge: 0.0 - Completely lost
   - Quarkle: 0.3 - Mentioned "programming language" but wrong name

### Model-Level Insights (from NDJSON)
- 14 requests, 8 tool calls (resolveLibraryId x3, queryDocs x5)
- 2 reasoning blocks visible before compaction
- After compaction: model used tools to search docs but didn't recall personal facts
- Total model tokens: 12,345 in / 8,901 out

### Root Cause

The compaction summary focused on technical discussion and omitted personal facts. The model's reasoning blocks before compaction mentioned the user's pet and company, but the compaction summary didn't preserve these details. After compaction, the model searched documentation extensively but had no personal context to draw from.

### Recommendations

1. Update compaction prompt to explicitly preserve personal context
2. Ensure facts are mentioned 2-3 times during conversation
3. Consider using a summary model that better preserves details
```

## References

- [Inspection Script](references/inspect-evals.ts) - JSON + NDJSON trace reader
- Eval location: `tests/evals/cases/compaction.eval.ts`
- Config: `evalite.config.ts` (root)
- Eval traces: `tests/evals/traces/<evalName>-<timestamp>.json`
- Model traces: `tests/evals/traces/<runId>.ndjson`
- Tracing middleware: `lib/infrastructure/ai/tracing/middleware.ts`
- Runner: `scripts/eval-runner.ts`

## Coding Agent Trace Analysis

When analyzing coding agent issues, use the trace inspector to examine the full request lifecycle across all 3 layers (worker, bridge, client).

### Inspector Commands

```bash
# List recent trace files
npx tsx lib/features/tracing/inspector.ts list

# Show full trace for a runId (all layers, chronological)
npx tsx lib/features/tracing/inspector.ts show <runId>

# Show only errors/warnings for a run
npx tsx lib/features/tracing/inspector.ts errors <runId>

# Show layer-specific events
npx tsx lib/features/tracing/inspector.ts layer worker <runId>
npx tsx lib/features/tracing/inspector.ts layer bridge <runId>
npx tsx lib/features/tracing/inspector.ts layer client <runId>

# Show aggregate stats
npx tsx lib/features/tracing/inspector.ts stats <runId>
```

### Trace Event Schema

```typescript
interface TraceRecord {
  timestamp: string;     // ISO 8601 timestamp
  runId: string;         // UUID correlating all layers
  layer: "worker" | "bridge" | "client";
  sessionId?: string;
  level: "debug" | "info" | "warn" | "error";
  eventName: string;     // e.g. "rpc.request", "stream.event", "run.failed"
  durationMs?: number;   // for paired start/end events
  payload: unknown;
}
```

### Analysis Workflow for Coding Agent

1. **List traces**: `npx tsx lib/features/tracing/inspector.ts list` — find the relevant runId
2. **Check errors first**: `npx tsx lib/features/tracing/inspector.ts errors <runId>` — any failures?
3. **Review bridge layer**: `npx tsx lib/features/tracing/inspector.ts layer bridge <runId>` — was the request received? DB lookup ok? Model mapping ok? Any malformed NDJSON lines?
4. **Review worker layer**: `npx tsx lib/features/tracing/inspector.ts layer worker <runId>` — did the session create? Did Pi SDK emit events? Were there prompt errors?
5. **Review client layer**: `npx tsx lib/features/tracing/inspector.ts layer client <runId>` — did the action call succeed? Did the run finalize?

### Common Coding Agent Failures

| Symptom | Trace Check |
|---------|-------------|
| "Session not found" | `bridge` → `db.lookup` with `found: false` |
| Worker unreachable | `bridge` → `rpc.http_error` events |
| Malformed Pi event | `bridge` → `stream.malformed` events (warn level) |
| Pi SDK crash | `worker` → `session.prompt_error` events |
| Model mapping error | `bridge` → `rpc.error` with `Unsupported coding agent model` |
| Run timeout | `bridge` → `stream.error` or `worker` → long duration without `session.prompt_complete` |
| Stub fallback active | `bridge` → `rpc.call` with URL pointing to `/worker-stub` |

### Trace Correlation

The API route includes `X-Trace-Run-Id` in the response headers. The client hook's `runId` is generated browser-side. The bridge API route also generates its own `runId` for the stream. For full correlation, check which `runId` appears in most events.

Traces are stored in `traces/{runId}.ndjson`. Enable with `TRACE_ENABLED=1`.
