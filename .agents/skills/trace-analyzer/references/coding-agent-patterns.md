# Coding Agent Trace Patterns

Use this guide for traces under `packages/tracing/traces/coding-agent/`.

## Minimal Workflow

Prefer session-level commands when the user provides a `sessionId`:

```bash
npx tsx packages/tracing/src/inspector.ts session <sessionId>
npx tsx packages/tracing/src/inspector.ts timeline <sessionId>
npx tsx packages/tracing/src/inspector.ts reconnect <sessionId>
```

Use run-level commands only after the session timeline points to a specific run:

```bash
npx tsx packages/tracing/src/inspector.ts summary <runId>
npx tsx packages/tracing/src/inspector.ts errors <runId>
npx tsx packages/tracing/src/inspector.ts show <runId>
npx tsx packages/tracing/src/inspector.ts stream <runId>
npx tsx packages/tracing/src/inspector.ts layer <worker|bridge|client> <runId>
```

## Reconnect Invariants

A healthy reconnect has this shape:

1. Client logs `client.connect.start`.
2. Bridge logs `connect.start`.
3. Worker logs `connect.snapshot_built`.
4. Bridge logs `connect.snapshot_received`.
5. Bridge logs `connect.translator_hydrated`.
6. Client logs `client.messages_snapshot_applied`.
7. If tools were in flight, bridge logs `connect.inflight_events_emitted`.
8. Bridge and worker close with compatible summaries:
   - `connect.stream_summary`
   - `worker.response_stream_summary`

Investigate the first missing or contradictory event.

## High-Signal Events

Client:

- `client.connect.start`: browser attempted reconnect.
- `client.event.RUN_STARTED`: AG-UI accepted the first run event.
- `client.messages_snapshot_applied`: AG-UI applied the snapshot.
- `client.event.RUN_ERROR` or `client.run_failed`: browser/AG-UI rejected the stream.
- `client.connect.detach`: React cleanup detached an active run.

Bridge:

- `connect.snapshot_received`: snapshot message count, role tail, `isStreaming`, and in-flight tool metadata.
- `connect.translator_hydrated`: current message id, active tools, emitted tool results, and step names seeded into the translator.
- `connect.inflight_events_emitted`: synthetic `TOOL_CALL_*`/`STEP_STARTED` events emitted from snapshot state.
- `connect.stream_summary`: counts of Pi input events, AG-UI output events, skipped duplicate `RUN_STARTED`, malformed lines, and translator state left at close.
- `stream.summary`: same summary for a normal send/run stream.

Worker:

- `session.prompt_stream_summary`: Pi event counts emitted during the original run.
- `connect.snapshot_built`: worker-side snapshot and in-flight tool state.
- `connect.stream_summary`: worker replay line counts, buffered lines, event counts, and close reason.
- `worker.response_stream_summary`: HTTP response chunk/byte counts and whether the client closed the response.
- `tool_pruning.epoch_completed`: Tool Pruning Epoch finished (carries `epochId`, `watermark`, `tokensBefore`, `tokensSavedEst`, `deterministicDrops`, `judgeDrops`, `candidatesEvaluated`, `batches`, `latencyMs`, `decisionModel`, `cost`, `failedOpen`).
- `tool_pruning.epoch_failed_open`: `/v1/systemone` timed out, returned an error or invalid JSON; Phase 0 drops still applied and the watermark step was consumed.
- `tool_pruning.epoch_aborted`: user aborted the Turn while a pruning Epoch was in flight; nothing persisted and watermark step stayed armed.

## Tool Pruning Post-Hoc Analysis (`.jsonl` Sessions & Traces)

Every pruning Epoch is persisted in the Pi session `.jsonl` transcript as a custom entry (`type: "custom", customType: "tool-pruning"`) with full per-candidate `audit` records (`toolCallId`, `toolName`, `target`, `tokensEst`, `source: "phase0"|"judge"|"leftover"`, `decision`, `keepResult`, `keepCall`, and Phase 0 structural signals).

### Step-by-Step Multi-Day Review Workflow

1. **Aggregate overview across recent days** (default: last 14 days, `prod` + `dev`):
   ```bash
   pnpm --filter coding-agent analyze:pruning -- --since YYYY-MM-DD --env prod
   ```
2. **Drill down into a specific session with regrets or missed drops**:
   ```bash
   pnpm --filter coding-agent analyze:pruning -- --session <sessionIdPrefix> --json
   ```
3. **Correlate with LLM calls and Epoch lifecycle events in `packages/tracing`**:
   ```bash
   npx tsx packages/tracing/src/inspector.ts timeline <sessionId>
   npx tsx packages/tracing/src/inspector.ts calls <sessionId>
   ```
   - `timeline <sessionId>` shows `tool_pruning.epoch_completed` (with `watermark`, `tokensSavedEst`, `deterministicDrops`, `judgeDrops`, `latencyMs`) interleaved with main-agent and `decision-default` judge calls.
   - `calls <sessionId>` + `call <runId> <seq>` inspects the exact prompt and JSON output of the SystemOne judge call when `TRACE_ENABLED=true`.

### How to Interpret Metrics for Threshold & Watermark Iteration

- **Regrets (False Positives — pruned target re-read/re-run later without an intervening `edit`/`write`)**:
  - Check `source` (`phase0` vs `judge`) and the candidate's `keepResult` score in the regret list.
  - If `judge` regrets cluster near `[0.15, 0.25)`, lower `dropResultThreshold` (e.g. `0.25 -> 0.20`) or increase `coolingRecentTokens` / `minCoolingToolCalls`.
  - If `phase0` regrets appear, inspect `editedLater` / `sameCommandRanLater` normalization in `supersession.ts`.
- **Missed Large Drops (False Negatives — `>= 1000` token candidates kept by judge and never referenced again)**:
  - Check the `Judge noul distribution (keepResult)` histogram and the `keepResult` scores of the missed drops.
  - If many unused large outputs sit in `[0.25, 0.40)`, raise `dropResultThreshold` or tighten the judge prompt rubric in `decision-state.ts`.
- **Watermark Step & Pi Compaction Ratio**:
  - Compare `Sessions triggered pruning` vs `Sessions reached Pi Compaction` and the `Steps` counter (`0.45`, `0.60`, `0.75`).
  - If sessions still hit Pi Compaction right after `0.75` with low savings, either candidates are protected by the cooling window or an earlier/additional step is needed.

Warnings/errors:

- `translate.step_finish_skipped`: bridge saw a tool finish without a matching step start.
- `translate.dropped`: translator dropped a Pi delta because required state was missing.
- `inflight.tool_execution_end_not_found`: worker saw a tool finish that was not tracked.
- `connect.malformed` or `stream.malformed`: bad NDJSON/SSE boundary or unexpected stream content.

## Common Failure Patterns

### Snapshot Not Applied

Symptoms:

- `connect.snapshot_received` exists.
- `client.messages_snapshot_applied` is missing.
- `client.run_failed` or `client.event.RUN_ERROR` appears soon after.

Likely causes:

- AG-UI invariant violation before/around `MESSAGES_SNAPSHOT`.
- Duplicate or missing `RUN_STARTED`.
- Snapshot includes shape AG-UI cannot normalize.

Next probe:

```bash
npx tsx packages/tracing/src/inspector.ts reconnect <sessionId>
npx tsx packages/tracing/src/inspector.ts layer client <runId>
```

### Step Finish Without Step Start

Symptoms:

- Error mentions `STEP_FINISHED`.
- `translate.step_finish_skipped` appears, or client fails after a `STEP_FINISHED`.

Likely causes:

- Snapshot seeded `stepNames` inconsistently with emitted synthetic `STEP_STARTED`.
- `tool_execution_end` replayed for a tool whose start was missed.
- Generated tool IDs were not mapped to Pi real tool IDs.

Check:

- `connect.snapshot_received.payload.inFlight[*].callEnded`
- `connect.translator_hydrated.payload.stepNameCount`
- `connect.stream_summary.payload.translator.activeStepCount`

### Reconnect Stream Hangs

Symptoms:

- Snapshot applies, but UI keeps running forever.
- `connect.stream_summary` is missing.
- Worker has `agent_end` in `connect.stream_summary.eventCounts` but bridge/client never finalize.

Likely causes:

- Worker replay did not call the completion callback on live `agent_end`.
- Browser detached before the bridge closed.

Check:

- `worker.response_stream_summary.closedByClient`
- `connect.stream_summary.closeReason`
- `client.connect.detach`

### Prompt or History Noise in Traces

Symptoms:

- `lifecycle.ndjson` is huge.
- RPC events contain full prompts/messages.

Expected behavior:

- RPC payloads should be summarized as counts and lengths, not full content.
- Use `TRACE_RAW=1` only for explicit deep debugging.

## Reporting Format

Lead with the broken invariant:

```text
Broken invariant: bridge hydrated 1 in-flight tool but client never applied MESSAGES_SNAPSHOT.
Evidence: run abc123 connect.snapshot_received -> connect.translator_hydrated, then client.run_failed.
Likely cause: AG-UI rejected the snapshot before synthetic tool events.
Next probe/fix: inspect layer client abc123, then validate snapshot message/tool shape.
```
