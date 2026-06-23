---
name: trace-analyzer
description: Analyze eval execution results from evalite or coding-agent traces. Use when the user asks to inspect traces, debug a run/session failure, analyze eval results, investigate coding-agent reconnect issues, or understand failures from a session id, run id, trace directory, eval score, or trace output.
---

# Trace Analyzer

Route first. This monorepo has two different trace systems.

## Route A: Coding Agent

Use this route when the request mentions coding agent, reconnect, session id, worker, bridge, Pi SDK, AG-UI, translator, RPC, streaming, or runtime failures in the agent UI.

Read `references/coding-agent-patterns.md` before analyzing.

Trace location:

```bash
packages/tracing/traces/coding-agent/<datetime>_<runIdShort>/
```

Inspector:

```bash
npx tsx packages/tracing/src/inspector.ts <command> [args]
```

Start from the identifier the user has:

```bash
# User provides a session id. This is the preferred reconnect workflow.
npx tsx packages/tracing/src/inspector.ts session <sessionId>
npx tsx packages/tracing/src/inspector.ts timeline <sessionId>
npx tsx packages/tracing/src/inspector.ts reconnect <sessionId>

# User provides a run id.
npx tsx packages/tracing/src/inspector.ts summary <runId>
npx tsx packages/tracing/src/inspector.ts errors <runId>
npx tsx packages/tracing/src/inspector.ts show <runId>
```

For reconnect issues, do not open `stream.ndjson` first. Use `reconnect <sessionId>` and inspect these lifecycle events:

- `client.connect.*` and `client.messages_snapshot_applied`: whether the browser attempted reconnect and accepted the snapshot.
- `connect.snapshot_received`: snapshot size, `isStreaming`, and in-flight tool shape.
- `connect.translator_hydrated`: state seeded into `PiToAguiTranslator`.
- `connect.inflight_events_emitted`: synthetic events emitted from the snapshot.
- `connect.stream_summary`: Pi input counts, AG-UI output counts, skipped duplicate starts, and translator pending state at close.
- `worker.response_stream_summary` and `connect.stream_summary`: whether either side saw client disconnect, reader completion, or an error.
- Warnings such as `translate.step_finish_skipped`, `translate.dropped`, `inflight.*_not_found`, or `connect.malformed`.

Only read `stream.ndjson` when the lifecycle summary proves the issue is token/delta-level, such as dropped text chunks, malformed lines, or missing tool-call args. Prefer `stream <runId>` or `layer bridge <runId>` instead of opening raw files.

## Route B: Chatbot Evals

Use this route when the request mentions eval, evaluation, evalite, compaction, fact recall, scorer, judge, simulator, or model quality metrics.

Read `references/chatbot-patterns.md` before analyzing.

Trace location:

```bash
tests/evals/traces/chatbot/<datetime>_<runIdShort>/
```

Inspector:

```bash
npx tsx .agents/skills/trace-analyzer/references/inspect-evals.ts <command> [args]
```

Start here:

```bash
npx tsx .agents/skills/trace-analyzer/references/inspect-evals.ts summary
npx tsx .agents/skills/trace-analyzer/references/inspect-evals.ts compact
npx tsx .agents/skills/trace-analyzer/references/inspect-evals.ts judge
```

## Analysis Rules

- Keep analysis progressive: summary, errors, lifecycle, then stream only if necessary.
- Preserve context: quote short event names and compact payload facts, not whole trace records.
- Prefer cross-run session timelines for reconnect bugs; a single run usually hides the disconnect/reconnect boundary.
- Report the first broken invariant, the evidence events, and the smallest next probe or fix.
- If the request does not clearly match coding-agent or eval traces, ask which trace system the user means.
