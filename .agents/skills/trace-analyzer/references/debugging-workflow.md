# Debugging Workflow

This is the complete debugging loop for trace-analyzer. It follows the five phases of
the `diagnosing-bugs` skill and maps each phase to trace-analyzer commands.

Read the route reference before you start:

- **Route A: Coding Agent** — `references/coding-agent-patterns.md`
- **Route B: Chatbot Evals** — `references/chatbot-patterns.md`

## Gate

State what you're looking for before each inspector command. No blind command runs.
The command you pick must answer the current phase's prediction; if you cannot state
the prediction, you are not ready to run it.

## Phase Mapping

| `diagnosing-bugs` phase | Trace Analyzer action |
|---|---|
| **Phase 1: Build a feedback loop** | Route first (`SKILL.md`), then name **one command that goes red on the user's exact symptom** and run it at least once. Route A: `session <sessionId>` or `timeline <sessionId>` for session/stream bugs, `reconnect <sessionId>` for reconnect bugs. Route B: `summary`, then `compact` / `judge` when the symptom is quality. Prefer a session-level loop over a run-level one: a single run hides the disconnect/reconnect boundary. The loop is the trace; everything after this is reading it. |
| **Phase 2: Reproduce + minimise** | Run the loop and confirm the failure it shows is the one the **user** described, not a nearby one. Capture the exact symptom (missing event, error phase, wrong count, slow stream). Then shrink the loop: narrow to the one `runId` or `sessionId`, the one `layer`, the one time window — cut inputs one at a time, re-running the loop, until every remaining element is load-bearing for going red. |
| **Phase 3: Hypothesise** | Generate **3–5 ranked, falsifiable hypotheses** before probing. Check Route A reconnect invariants and failure patterns, or Route B compaction/eval patterns, to seed them. Each hypothesis must name the probe that would confirm or kill it: e.g. "if the snapshot was rejected before synthetic tool events, then `layer client <runId>` shows no `client.messages_snapshot_applied`". Show the ranked list to the user before testing; proceed with your ranking if they're AFK. |
| **Phase 4: Instrument** | Run **one probe per prediction, one variable at a time**. Never stream everything and grep. Route A: `layer <worker\|bridge\|client> <runId>`, `stream <runId>`, `show <runId>`, `reconnect <sessionId>`. Route B: `model-conversation <runId>` over `lifecycle.ndjson` + `stream.ndjson`. For perf/streaming regressions, establish a baseline count or timing first, then bisect. `TRACE_RAW=1` is a last resort for full prompts/messages — it enlarges the trace and hides the signal. If you add debug logging to app code, tag it (`[DEBUG-a4f2]`) so cleanup is one grep. |
| **Phase 5: Fix + regression test** | Fix at the source, not the symptom. The correct seam for a trace bug is a test that replays the captured trace — or exercises the translator/invariant the trace exposed — and fails before the fix. Watch it fail, apply the fix, watch it pass, then re-run the Phase 1 loop against the **original** (un-minimised) scenario and confirm the broken invariant is gone. If the only available seam is too shallow (a unit test that cannot replicate the chain the trace showed), do not settle for false confidence — see the post-mortem handoff below. |

## Post-Mortem Handoff

When Phase 5 finds **no correct seam**, that absence is itself the finding: the
architecture is what prevents the bug from being locked down. Record it in the
report (below) and hand the post-mortem to the `improve-codebase-architecture`
skill, naming the bug pattern and the missing seam so the next debugger inherits
the conclusion instead of rediscovering it.

## Reporting Format

```text
Broken invariant: [what should be true but isn't]
Evidence: [event names and compact payload facts]
Hypothesis: [why this is happening]
Next probe/fix: [smallest action to confirm or resolve]
```
