# Eval Suite

Test suite to evaluate the chatbot's quality using [Evalite](https://evalite.dev).

## Usage

The runner brings up the whole environment: test DB, migrations, `next dev` and evalite. All in a single command.

```bash
# Run all evals
pnpm eval

# Run a specific case
pnpm eval -c compaction

# Extra flags
pnpm eval -c compaction --port 3001          # change the port
pnpm eval -c compaction --keep-db            # do not stop the DB at the end
pnpm eval -c compaction --no-db              # assume the DB is already up
pnpm eval -c compaction --no-migrate         # skip migrate
pnpm eval -c compaction --no-server          # assume next dev is already up
```

## What does the runner do?

1. It requires `--env=dev|test|prod` in `process.argv` (ADR 0011): there is no
   `.env.*` and no environment-variable selector. The Environment travels by argv
   to every child.
2. It exports only the eval harness: `EVAL_BASE_URL=http://localhost:<port>`
   (the app configuration is provided by the typed bundle of `packages/config`).
3. It brings up the test DB (`docker compose -f docker-compose.test.yml up --wait`).
4. It migrates the DB. It seeds no data: each eval case creates its own user with
   `createTestUser()`.
5. It starts `next dev --turbo -p <port>` (with a `[next]` prefix in the logs) — or
   reuses one already running on that port.
6. It waits for HTTP `:200/3xx/4xx` (120s timeout).
7. It starts `npx evalite run <case>` with an `[evalite]` prefix.
8. Cleanup: it kills the children, stops the DB (unless `--keep-db`), releases the
   `tests/evals/.runner.lock` lockfile.

## Available cases

### `compaction`

Evaluates the quality of conversation compaction:

- **Compaction Occurred** (deterministic): Checks that compaction ran and meets a minimum compression ratio of 10x
- **Fact Recall** (LLM Judge): Injects 3 fictitious facts into the conversation, triggers compaction, and verifies with Deepseek v4.1 Flash that the model remembers the facts after compaction

### `mode-routing`

Measures the Chat Mode `auto` **router**, not a full chat turn: it calls
`resolveChatMode()` with the real Jev 1.13 adapter (OpenRouter Decisions API via
`@openrouter/sdk`) over a labeled dataset of 39 ES/EN messages
(`tests/evals/scenarios/mode-routing-dataset.ts`). It does not touch `/api/chat`, the DB,
or any chat model: one classifier call per message (~$0.00002 each, **~$0.0008 the full
run**), ~5 s of evalite.

```bash
# Canonical command (brings up next dev + test DB even if the case does not use them)
pnpm eval -c mode-routing

# Cheap iteration: the case needs neither server nor DB
pnpm eval -c mode-routing --no-server --no-db --no-migrate
```

Scorers:

- **Global accuracy**: % of messages resolved to the mode the dataset labels.
- **Per-class accuracy**: ctx7 / web / neither separately (scored as their unweighted
  mean).
- **Confusion matrix**: expected label × resolved mode; it is scored as the global
  accuracy so it does not distort the mean.
- **Confidence of correct calls**: distribution of Jev's raw confidence on the hits the
  gate let through to a tool; it includes `thresholdSweep` (accuracy that each threshold
  would give) and `flatOptimum` (band of thresholds with the best accuracy). Each
  result's `output` keeps the `raw` (classifier answer before the gate) and the
  `resolved` (`{ mode, reason, confidence, probabilities, modelId, provider, latencyMs }`).

Dataset (42: ctx7 13 / web 15 / neither 14): library, framework, SDK, CLI or language API
documentation (→ ctx7); current affairs, prices, releases, availability, sources to
cross-check, content of a URL, real-world comparisons and official or normative documents
whose validity/edition must be verified at the issuing source (→ web); chit-chat,
repo-local questions and text transformations (→ neither). It includes pronominal
follow-ups **with** context (they inherit the previous turn's referent) and **without**
context (labeled `neither`: the referent is unresolvable, so paying for a tool is not
justified).

Current criteria (v2) and threshold are documented in the header of
`tests/evals/cases/mode-routing.eval.ts`; the source of truth is
`lib/features/chat/mode-routing/questions.ts` (`CHAT_MODE_ROUTING_QUESTION_VERSION`) and
`CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD` in `mode-routing/constants.ts`. **Any change of
criteria or threshold is decided with this eval's numbers** (and updates the 03/04 tests
in the same commit). Baseline v1 (39 entries, 3 runs): 38/39 (97.4%), diagonal matrix
except for one `ctx7 → neutral/low_confidence`; the swept accuracy is 97.4% across the
whole 0–0.75 band and only drops above 0.75 (one run reached 100% only at 0.5 and the
other did not replicate it), so lowering the gate does not improve reproducibly: final
threshold **0.7**. With the v2 criteria (official/normative documents and their validity
added to `web`, 42 entries, 1 run): 41/42 (97.6%), ctx7 12/13, web 15/15, neither 14/14,
the same single ctx7 failure. The ±0.05 variance in Jev's `confidence` is real, so
threshold decisions are made over several runs, not over one.

## Structure

```
evalite.config.ts                # Global configuration (project root)
scripts/eval-runner.ts           # Environment runner (DB, next dev, evalite)
lib/infrastructure/env.ts        # isTestMode/isEvalMode/resolveEnvFile helpers
packages/tracing/                # Tracing middleware (wrap LanguageModelV3)
tests/evals/
├── lib/
│   ├── auth.ts                  # Test user management
│   ├── chatbot-client.ts        # HTTP client for the chatbot
│   ├── simulator.ts             # Conversation simulator
│   ├── compaction-detector.ts   # Compaction event detector
│   └── scorers/
│       ├── compaction-occurred.ts
│       ├── fact-recall.ts
│       └── mode-routing.ts      # Router report and scorers (accuracy, confusion, threshold)
├── cases/
│   ├── compaction.eval.ts
│   └── mode-routing.eval.ts     # Eval of the auto ↔ Jev router (it does not need next dev)
└── scenarios/
    ├── compaction-recall.txt
    └── mode-routing-dataset.ts  # Labeled ES/EN dataset (39 messages)
```

## Requirements

- LLM credentials reachable via the **Model Gateway** (`MODEL_GATEWAY_URL`/`MODEL_GATEWAY_API_KEY`, including the Mock URL `:4001` in test) and Docker to bring up the test DB.
- No need to have the app running — the runner brings it up.

## Traces

The system writes two artifacts per run:

1. **Eval traces** (`tests/evals/traces/<evalName>-<timestamp>.json`): High-level events (`simulator`, `chatbot`, `judge`) written manually by the eval case. It includes the `traceRunId` to correlate with the internal traces.

2. **Model internal traces** (`tests/evals/traces/chatbot/<timestamp>_<runId>/`): Progressive events (`start`, `text-delta`, `reasoning-delta`, `tool-input-*`, `tool-call`, `tool-result`, `source`, `finish`, `error`, `abort`) written by the tracing middleware on every `streamText`/`generateText` call in the app. It is enabled with `TRACE_ENABLED=1` (forced by the runner).

The `/api/chat` route handler propagates `X-Trace-Run-Id` and `X-Trace-Request-Id` in the response, and the eval's `chatbot-client.ts` reads them and stores them in the chatbot trace `metadata`, making it possible to cross both files.

### Event format (NDJSON)

Each line is a JSON `TraceEvent`. Example:

```json
{"ts":"2026-06-02T10:00:00.000Z","runId":"<uuid>","requestId":"<uuid>","stepIndex":0,"mode":"stream","chatId":"<id>","userId":"<id>","agent":"context7","modelKey":"Deepseek v4.1 Flash","phase":"start","payload":{"prompt":[{...}],"model":{"provider":"opencode-zen-go","modelId":"deepseek-v4.1-flash"},"settings":{...}}}
{"ts":"2026-06-02T10:00:00.123Z","runId":"<uuid>","requestId":"<uuid>","stepIndex":0,"mode":"stream","chatId":"<id>","phase":"text-delta","blockId":"text-1","blockKind":"text","payload":{"text":"Hello"}}
{"ts":"2026-06-02T10:00:00.456Z","runId":"<uuid>","requestId":"<uuid>","stepIndex":0,"mode":"stream","chatId":"<id>","phase":"finish","payload":{"finishReason":{"unified":"stop"},"usage":{"inputTokens":100,"outputTokens":50},"duration_ms":456}}
```

## Analyzing results

### Using the analysis skill

Ask the agent:
> "Analyze the last run of the compaction eval"

The agent will use the `eval-analyzer` skill to:
- Inspect scores and metadata
- Review AI SDK traces
- Diagnose problems
- Provide recommendations

### Manual inspection

```bash
# View a compact summary of the last run
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts compact

# View the full conversation
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts conversation

# View the judge evaluations
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts judge

# View the last full run (JSON)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts last

# View a summary of the last 10 runs
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts summary

# View the model traces (NDJSON)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model <runId>

# Rebuild the conversation from the model's perspective
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model-conversation <runId>
```

### Evalite UI

```bash
npx evalite
```

Open `http://localhost:3006` to see the results in a web interface.

## Adding new cases

1. Create `tests/evals/cases/[case-name].eval.ts`
2. Use `evalite()` with `data`, `task`, and `scorers`
3. Run it with `pnpm eval -c [case-name]`
