# Reference notes — `fast-jev-compaction`

Working notes for the Tool Pruning design. Source: local clone of
`https://github.com/tamaratran/fast-jev-compaction` (HEAD `e3f262a`), indexed
with CodeGraph (13 files, 1891 nodes). Not a decision record: decisions live in
`spec.md` and `docs/adr/`.

## 1. What the reference tool does

Replaces an LLM **summary** compaction with **deletion of stale tool calls and
tool results**. Text messages are never rewritten. Everything kept stays
verbatim.

The pipeline (`src/compact.ts`):

1. **Pair** every `tool_use` with its `tool_result` by `tool_use_id`
   (`collectToolCalls` in `src/state.ts`). Calls with no result are not
   candidates. Calls in the first message and in the newest
   `preserveRecentMessages` (default 6) are **pinned**.
2. **Build a decision state** from the whole conversation, oldest first:
   `{ context, goal, history }`. Tool results are replaced by a note
   (`ok, 4213 chars (omitted)`); tool inputs are included; texts are included.
   Nothing is summarised.
3. **Fit the state** into `maxStateTokens` (default 25k) in escalating stages:
   tool inputs to 1000 → 200 → 60 chars; long texts abridged head+tail
   (oldest first, pinned last); old messages collapsed to
   `[… N chars omitted …]`; old tool calls to one line each; old call-less
   messages dropped; runs of call-only messages folded. Throws if it still
   does not fit.
4. **Ask two `noul` questions per candidate**: should the *call* stay
   (knowing it was made still matters), and should the *result* stay verbatim
   (contents still needed, re-running would not do). Questions are batched so
   state + questions stays under `maxRequestTokens` (default 30k, Jev's request
   ceiling is 32k). The full state is resent with every batch; batches run
   concurrently.
5. **Map probabilities to one action** (`keepThreshold` 0.5):
   `keepResult ≥ t` → keep both; else `keepCall ≥ t` → keep the call and
   truncate the result to its first `truncateHeadChars` + one-line note; else
   remove call + result.
6. **Rebuild** the transcript: a message that loses all content is removed,
   untouched messages are the same object identities, no result is ever left
   without its call.

Failure policy: any transport error, malformed answer, missing key or
unfittable history **throws**; the host decides the fallback. In the Claude
Code plugin, the fallback is the built-in summary, and the plugin also
falls back when the achieved reduction is below `minReductionRatio` (0.25).

**When it runs.** Not per tool and not per message. `compact()` is a one-shot
pass over the whole transcript when called. The Claude Code adapter
(`hooks/fast-jev.ts`) calls it in two cases:

- `on('session.compact')`: whenever Claude Code compacts — a manual `/compact`
  or the engine's own auto-compaction. The hook replaces the native summary
  with the pruning result.
- `on('turn.complete')`: after every Turn it reads
  `$.session.usage().context.percent`; if it is at or above
  `compactAtPercent` (default **60**), it calls `$.session.compact()` itself,
  which fires the previous hook. A `compacting` flag prevents re-entry; a
  failure only logs `auto-compact skipped`.

So the cadence is **reactive at a context-window threshold, checked at Turn
end**, plus on-demand. When it fires, every tool call in the transcript is a
candidate (except pinned ones), not just the recent ones. This is the
structural difference with our D3/D6: the reference decides everything at a
pressure point, destructively; we decide the previous Turn every Turn,
non-destructively.

The reference implementation is calibrated for one specific decision model
(TypeSafe Jev `/v1/systemone`, `noul` = calibrated probability of "yes"). Its
state fitting, batching and token estimator exist to obey that model's 32k
request limit.

## 2. How it maps onto this repository

### 2.1 Seams available in the Pi SDK (worker `0.85.1`)

| Seam | Behaviour | Fit for the reference approach |
| --- | --- | --- |
| `pi.on("context")` | Fires **before every LLM call**, gets a deep copy of `AgentMessage[]`, returns a replacement list. Non-destructive. | **Direct mapping.** Prune tool calls/results per request; session file, AG-UI stream and UI transcript stay intact. |
| `pi.on("session_before_compact")` | Can return a custom `summary` + `firstKeptEntryId`; cannot return an arbitrary pruned message list. | **Not a mapping.** The reference approach is "no summary, keep the originals minus pruned tools"; Pi's compaction can only express a summary plus a kept suffix. |
| `pi.on("tool_result")` | Can patch `content`/`details`/`isError` at result time. | Deterministic truncation only; no deferred, context-aware decision. |
| `pi.setActiveTools()` | Changes which tool *definitions* the model is offered. | Different feature (tool-set pruning), not the reference feature. |

`AgentMessage[]` in the `context` event is the model-facing conversation. The
tool-call/tool-result pairing invariant must be preserved exactly as the
reference does it, or provider serialization breaks.

### 2.2 Decision model available here

- `/v1/systemone` with `decision-default` (`microsoft/microsoft-decision-1`,
  ZDR) is already wired in the gateway.
- **`noul` is supported end-to-end**, contrary to an earlier reading of the
  `model-gateway-ai-sdk` skill (that reference documents only `choice`, but it
  is outdated). Evidence, in order of strength:
  - LiteLLM **1.108.0** (the version in `packages/model-gateway/.venv`) models
    `NoulQuestion` / `NoulAnswer` in `litellm/types/decisions.py`, uses `noul`
    in its own `/v1/systemone` OpenAPI example, and maps it to
    `DecisionsIRPredicateQuestion` in `litellm/decisions/call.py`.
  - `decision-default` routes through OpenRouter's `/alpha/decisions` config,
    which inherits the OpenAI decisions transformation: `noul` → `predicate`.
  - **Live probe** against `http://127.0.0.1:4000/v1/systemone` with
    `decision-default`: 80 `noul` questions over a ~6.2k-token synthetic
    history returned 80 numeric answers in **0.95 s** for **$0.00026**
    (`microsoft/microsoft-decision-1-20261009`).
- Real gaps, all consumer-side and small:
  - `inferenceKit.decide` (chatbot) types and parses `choice` only. The worker
    does not use it and would call the endpoint with `fetch` anyway.
  - The JS testing toolkit's `decisionsResponse` renders `choice` only, so an
    MSW-driven test for a `noul` consumer needs it extended.
  - The `model-gateway-ai-sdk` skill's `references/decisions.md` claims only
    `choice` is supported; worth fixing when this feature lands.
- Consequence: the reference's **two `noul` questions + `keepThreshold`**
  design transfers 1:1; no need to invent a closed-choice verdict.

### 2.3 Context that already exists in this repo

- [`packages/coding-agent/extensions/`](../../packages/coding-agent/extensions/)
  holds first-party Pi extensions loaded by `additionalExtensionPaths`; they
  import worker `src/` modules and `config` directly.
- The worker already maps Pi events to AG-UI and persists an event log
  ([`packages/coding-agent/src/agui/`](../../packages/coding-agent/src/agui/)),
  which is what the user sees — pruning the model context must not change it.
- The Chatbot has its own summary-based Compaction
  ([`packages/chatbot/lib/features/compaction/`](../../packages/chatbot/lib/features/compaction/)),
  and Pi has its own auto-compaction at `contextWindow − 16 384`.

### 2.4 Pi event semantics for "turn"

Pi's `turn_start` / `turn_end` fire **per LLM response + its tool calls**, not
per user turn. In this repo a Turn is a Coding Agent Session Turn, so the
boundaries are:

| Our Turn boundary | Pi seam |
| --- | --- |
| Turn begins (user prompt submitted) | `before_agent_start` (after `input`, before the agent loop) |
| Every LLM request inside the Turn | `context` (deep copy of `AgentMessage[]`) |
| Turn truly finished (no retry/compaction/follow-up left) | `agent_settled` (not `agent_end`) |

Messages carry no ids; `ToolCall.id` / `ToolResultMessage.toolCallId` are the
stable keys a decision cache can use. Tool results are separate messages, so
dropping one means also removing the `toolCall` block from the assistant
message that emitted it (provider serialization requires the pair).

## 3. Reference criteria and prompting (verbatim)

State context, sent with every decision request (`src/state.ts`):

> A coding assistant conversation is being compacted to free context. `history`
> is the whole conversation so far, oldest first; tool outputs are replaced by
> a short `result` note and long texts may be abridged. Each question asks
> whether one tool call, or the full output of that call, still needs to stay in
> the history verbatim. Whatever is not kept is deleted permanently, but the
> assistant can always re-run a tool or re-read a file.

Two `noul` questions per candidate call (`questionsFor` in `src/compact.ts`):

> `call_t7`: Tool call t7 (Read) should stay in the history: knowing this call
> was made, with its input, still matters for what the assistant does next

> `result_t7`: The full output of tool call t7 (Read, 4213 chars) should stay in
> the history verbatim: the assistant still needs its contents and re-running the
> tool would not do

`goal` defaults to the last three user prompts, each truncated to 500 chars
(`goalFromMessages`). The state entry per call is
`{ id, tool, input, result: "ok, 4213 chars (omitted)" }`; `isError` only
changes the note to `error, … chars (omitted)`.

What the criteria encode, and what they leave out:

- **Two orthogonal axes.** "Provenance" (the call happened, with this input)
  and "content" (the payload is still needed). Keeping the call while dropping
  the result preserves the narrative of what was tried without the payload.
- **Future utility, not past usefulness.** Both questions say "still matters /
  still needs", and the state context says whatever is dropped is deleted
  permanently. The model is asked to predict the next steps.
- **Re-runnability is asserted, not qualified.** The only mitigation offered is
  "the assistant can always re-run a tool or re-read a file". That is false for
  `edit`/`write` and for side-effecting `bash`; the model is never told which
  tools are safe to repeat.
- **No `criteria: { true, false }`.** The `noul` type supports them (LiteLLM
  renders them as "Answer true when: …"); the reference passes instructions
  only, so the model has to infer the decision rule.
- **No supersession rule.** Nothing says a later read/edit of the same file
  supersedes an earlier result, although the whole history is in the state and
  the model can infer it.
- **No error policy.** An errored result can be the root cause (keep) or a
  transient failure (drop); only the error flag distinguishes them.
- **No per-tool policy.** `Read`, `Bash`, `Edit`, `Grep`, `publish_artifact` all
  get the same question shape; tool names and inputs are the only signal.
- **The unit of decision is a call, not a turn.** Every candidate is scored
  independently; there is no "this whole exploration was superseded".

## 4. Friction points the design must answer

1. **Latency and placement.** `context` fires per LLM call, including every
   step of a ReAct cycle; the reference pays one decision round-trip per
   compaction. A turn-granular cadence (compute once per completed Turn, apply
   at the next Turn) keeps the hot path free, at the price of deciding without
   the user's next prompt.
2. **Goal visibility.** The relevance question depends on what the user is
   about to ask. Decisions taken at the end of Turn N do not see Turn N+1's
   prompt; decisions taken at Turn start can, but then they need to land on a
   later `context` call (or block the first one).
3. **The reference re-sends the whole history per batch.** Fine for a 32k
   model; proportional to our windows and costly in time. A turn-scoped state
   is smaller but loses cross-turn supersession context.
4. **Idempotency differs per tool.** Re-running `read`/`grep`/`ls` is safe;
   re-running `bash` with side effects or repeating an `edit`/`write` is not.
   The reference leans on "the assistant can always re-run the tool".
5. **History identity.** Pi messages have no ids, but `ToolCall.id` /
   `toolCallId` are stable across requests, so decisions can be cached per
   tool call. Dropping a call must also remove its result (and vice versa).
6. **Observability.** The user sees the AG-UI transcript, not the pruned
   context. Without an explicit signal (trace log, event, UI hint) the feature
   is invisible — including when it harms.
7. **Interaction with compaction.** Pruning may keep the session under Pi's
   compaction threshold indefinitely, which changes when (and whether) a
   summary ever happens.

## 5. Design tree (frontier, to be settled by the grilling)

- Goal and scope: what is pruned (tool calls/results vs tool definitions);
  which surface (worker vs chatbot compaction); prototype vs shipped feature.
- Decision contract: two `noul` questions + `keepThreshold` (reference design,
  now known to be available); criteria text, tool policy, fallback.
- Cadence: per completed Turn vs per Turn start vs per LLM call; which prompt
  the goal sees; one decision call per Turn over which candidate set.
- Safety: which tools are prunable, pinned window, pairing invariant, abort
  behaviour, maximum loss.
- Cost: state scope, batching, caching, timeouts, concurrency with the main
  model call.
- Provenance and observability: trace fields, stats, UI signal, evals.
- Rollout: configuration, environment gating, defaults, kill switch.
