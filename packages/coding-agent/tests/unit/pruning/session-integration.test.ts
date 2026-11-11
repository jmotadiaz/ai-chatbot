/**
 * Tool Pruning session integration (spec D1/D3/D6/D7, ticket 07).
 *
 * These tests drive real Pi sessions in-process through the worker's own
 * composition: `createTestWorkerContext()` for every path and credential, the
 * real first-party extensions loaded through jiti (`getExtensionPaths`), the
 * worker's `ModelRuntime` (sandbox models.json + auth.json) and the official
 * Model Gateway toolkit answering MSW at the HTTP seam. Every path lives inside
 * the per-test sandbox — no production or development agent directory, no
 * `process.env`, no live Gateway: the mocked `/v1/chat/completions`,
 * `/v1/systemone` and `/v1/models/catalog` are the only endpoints the worker can
 * reach.
 *
 * The assertions live at the provider-payload seam — the request bodies the
 * mock `/v1/chat/completions` receives — because that is exactly what Tool
 * Pruning rewrites. Everything else (the session environment, the resolved
 * model, `before_agent_start` / `context` ordering, branch-aware persistence)
 * is exercised by the real SDK instead of a hand-written double.
 *
 * Token accounting note: the scripted provider reports zero usage, so Tool
 * Pruning falls back to `estimateTokens` over the messages (spec D3). Pi's own
 * auto-compaction also keys off the reported usage, but a context larger than
 * `contextWindow - 16 384` still triggers it, so the fixtures keep every
 * projection below that ceiling: eight 20k-token results (160k) fit a 200k
 * window, and the pruning staircase is pinned through
 * `WorkerRuntimeConfig.toolPruning` instead of pretending to fill it.
 *
 * The cadence under test is the monotonic staircase of spec D3: consuming a
 * step retires it and every lower one, so the suite asserts both halves — a
 * crossed step never fires twice, and only the next step (or a Pi Compaction)
 * brings the judge back.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
  type SessionEntry,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  decisionsResponse,
  textReply,
  toolCallReply,
  type ChatReply,
  type DecisionsRequest,
  type GatewayScenario,
  type OperationReply,
} from "@ai-chatbot/model-gateway-testing";
import { setupWorkerGatewayHarness } from "../../helpers/gateway-harness";
import {
  createTestWorkerContext,
  type TestWorkerContext,
} from "../../helpers/test-context";
import { getExtensionPaths } from "../../../src/runtime/pi-packages";
import {
  GATEWAY_PROVIDER_ID,
  resetGatewayCatalogForTests,
} from "../../../src/runtime/gateway-catalog";
import {
  getModelRuntime,
  resetModelRuntimeForTests,
} from "../../../src/runtime/model-runtime";
import {
  publishToolPruningBridge,
  resetToolPruningBridgeForTests,
  type ToolPruningTraceLogger,
} from "../../../src/pruning/pruning-bridge";
import {
  TOOL_PRUNING_ENTRY_TYPE,
  type ToolPruningConfigOverrides,
  type ToolPruningEpochEntry,
} from "../../../src/pruning/config";

// Same seam the other worker tests substitute: the tracing library is only an
// observability sidecar here, and the pruning bridge collector below records
// what the extension reports instead.
vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

// A generated Pi session (jiti extension loading + real Turns) is slower than a
// pure unit test but still sub-second; the budget only guards hangs.
vi.setConfig({ testTimeout: 30_000 });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GATEWAY_URL = "http://127.0.0.1:4099";
const GATEWAY_API_KEY = "test-gateway-key";
const MODEL_ID = "Pruning Test Model";

/**
 * `estimateTokens` is a chars/4 heuristic, so every "big" result below costs
 * ~20 000 tokens: four of them clear the Phase 1 short-circuit (30 % of the
 * window) while eight still fit under Pi's compaction ceiling.
 */
const BIG_RESULT_CHARS = 80_000;
const BIG_RESULT_TOKENS = BIG_RESULT_CHARS / 4;
const CONTEXT_WINDOW = 200_000;

/** Gateway catalog entry: the worker's only provider is `model-gateway`. */
const catalog = [
  {
    id: MODEL_ID,
    company: "test",
    isDefault: false,
    contextWindow: CONTEXT_WINDOW,
    maxTokens: 8_000,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
    reasoning: false,
    thinkingLevels: [],
    defaultThinkingLevel: null,
    supportedFiles: [],
    supportedOutput: ["text"],
    zeroDataRetention: false,
    temperature: null,
    topP: null,
    topK: null,
  },
];

const bigResult = (label: string): string =>
  `HEAD-${label}\n${"Z".repeat(BIG_RESULT_CHARS)}\nTAIL-${label}`;

const SMALL_RESULT = `SMALL-HEAD\n${"x".repeat(600)}\nSMALL-TAIL`;

/**
 * Custom tools shadow the built-ins by name (Pi's tool registry is keyed by
 * tool name), so the scripted model can drive `grep` / `read` / `bash` / `edit`
 * without a real filesystem and with byte-stable outputs.
 */
const toolDefinition = (
  name: string,
  parameter: string,
  text: string,
): ToolDefinition => ({
  name,
  label: name,
  description: `${name} tool`,
  parameters: Type.Object({ [parameter]: Type.String() }),
  execute: async () => ({ content: [{ type: "text" as const, text }], details: {} }),
});

const TOOLS: ToolDefinition[] = [
  toolDefinition("grep", "pattern", bigResult("ALPHA")),
  toolDefinition("read", "path", bigResult("READ")),
  toolDefinition("bash", "command", bigResult("BASH")),
  toolDefinition("edit", "path", "edit ok"),
];

const SMALL_TOOLS: ToolDefinition[] = [
  toolDefinition("grep", "pattern", SMALL_RESULT),
  toolDefinition("read", "path", SMALL_RESULT),
  toolDefinition("bash", "command", SMALL_RESULT),
  toolDefinition("edit", "path", "edit ok"),
];

const ACTIVE_TOOLS = ["grep", "read", "bash", "edit"];

/**
 * The spec's three-step staircase (`[0.45, 0.60, 0.75]`) scaled to the fixture
 * window: one 80 000-char result costs ~20 000 tokens, so the steps land at
 * 20k / 70k / 110k tokens — one, four and six results of the scripted Turns.
 * The property the suite is about survives the scaling: crossing a step retires
 * it and every lower one, and only the next step (or a Pi Compaction) re-arms
 * the judge.
 *
 * The tie-breakers (Cooling Window minimums and the protected-Turn cap) are
 * collapsed so the scripted Turns alone decide what is prunable. The spec
 * defaults stay untouched everywhere else.
 */
const STAIRCASE: ToolPruningConfigOverrides = {
  watermarks: [0.1, 0.35, 0.55],
  minWorthwhilePruneTokens: 1,
  minJudgeWorthwhileTokens: 0,
  coolingRecentTokens: 0,
  minCoolingToolCalls: 0,
  maxProtectedTurnTokens: 0,
};

/**
 * One Turn of exploration: four paired calls whose ids are the `toolCallId`s
 * Phase 0, the judge and the mask map are all keyed by. `bash` cannot receive
 * `drop_call` (spec D2), so it exercises the execution-tool branch. The `path`
 * is a parameter because Phase 0 supersedes a full `read` of the same path, and
 * a scenario that wants four untouched candidates per Turn must read elsewhere.
 */
const explorationCalls = (
  prefix: string,
  counter = 1,
  path = "src/a.ts",
): ReturnType<typeof toolCallReply> =>
  toolCallReply({
    calls: [
      {
        id: `${prefix}grep`,
        name: "grep",
        arguments: JSON.stringify({ pattern: "alpha" }),
      },
      {
        id: `${prefix}read`,
        name: "read",
        arguments: JSON.stringify({ path }),
      },
      {
        id: `${prefix}bash`,
        name: "bash",
        arguments: JSON.stringify({ command: "pnpm test" }),
      },
      {
        id: `${prefix}grep2`,
        name: "grep",
        arguments: JSON.stringify({ pattern: `beta-${counter}` }),
      },
    ],
  });

const FIRST_TURN_IDS = ["t1grep", "t1read", "t1bash", "t1grep2"] as const;

// ---------------------------------------------------------------------------
// Provider-payload helpers (the seam these tests assert on)
// ---------------------------------------------------------------------------

/** One message of the OpenAI-compatible `/v1/chat/completions` body. */
interface ProviderMessage {
  role: string;
  content?: unknown;
  tool_calls?: { id: string; function?: { name?: string } }[];
  tool_call_id?: string;
}

interface ProviderPayload {
  model: string;
  messages: ProviderMessage[];
}

const chatPayloads = (scenario: GatewayScenario): ProviderPayload[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ProviderPayload);

const latestPayload = (scenario: GatewayScenario): ProviderPayload => {
  const payloads = chatPayloads(scenario);
  expect(payloads.length).toBeGreaterThan(0);
  return payloads[payloads.length - 1]!;
};

const systemOneRequests = (scenario: GatewayScenario): { body?: unknown }[] =>
  scenario.requests.filter((request) => request.path === "/v1/systemone");

/** `toolCallId`s of the `ToolCall` blocks the provider is asked to continue. */
const providerCallIds = (payload: ProviderPayload): string[] =>
  payload.messages.flatMap((message) => message.tool_calls?.map((call) => call.id) ?? []);

/** `toolCallId`s of the `ToolResultMessage`s the provider receives. */
const providerResultIds = (payload: ProviderPayload): string[] =>
  payload.messages
    .filter((message) => message.role === "tool")
    .map((message) => message.tool_call_id as string);

const providerResultText = (payload: ProviderPayload, toolCallId: string): string => {
  const result = payload.messages.find(
    (message) => message.role === "tool" && message.tool_call_id === toolCallId,
  );
  if (result === undefined) throw new Error(`No tool result for ${toolCallId} in the payload`);
  return typeof result.content === "string" ? result.content : "";
};

/**
 * Rough size of the context a payload carries, in the mask's own chars/4
 * heuristic. Only used to pin a scenario at a ratio of the window ("this Turn
 * still sits between two retired steps"); the assertions on it are order-of-
 * magnitude, never exact.
 */
const payloadTokens = (payload: ProviderPayload): number =>
  Math.ceil(JSON.stringify(payload.messages).length / 4);

/** D1 invariant 1: no `ToolCall` reaches the provider without its result. */
function expectPairedPayload(payload: ProviderPayload): void {
  expect([...providerResultIds(payload)].sort()).toEqual([...providerCallIds(payload)].sort());
}

/** The `drop_result` marker `applyPruningMask` writes for a stubbed result. */
const stubMarker = (toolName: string, resultText: string): string =>
  `Tool Pruning: omitted ${resultText.length - 300} chars from ${toolName}`;

/** The full transcript the Coding Agent UI keeps rendering (spec D1). */
const transcriptResultText = (session: AgentSession, toolCallId: string): string => {
  const message = session.messages.find(
    (candidate) => candidate.role === "toolResult" && candidate.toolCallId === toolCallId,
  );
  if (message === undefined || message.role !== "toolResult") {
    throw new Error(`No toolResult ${toolCallId} in the transcript`);
  }
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
};

/** Persisted `tool-pruning` entries of the active branch (spec D7). */
const pruningEntries = (manager: SessionManager): ToolPruningEpochEntry[] =>
  manager
    .getBranch()
    .filter(
      (entry: SessionEntry) =>
        entry.type === "custom" && entry.customType === TOOL_PRUNING_ENTRY_TYPE,
    )
    .map((entry) => (entry as { data?: unknown }).data as ToolPruningEpochEntry);

/**
 * Pruning entries appended after the latest `compaction` entry (spec D7).
 * Watermark steps reset at compaction while masks across the active branch stay
 * in force for any tool calls preserved in Pi's kept recent tail.
 */
const pruningEntriesSinceCompaction = (
  manager: SessionManager,
): ToolPruningEpochEntry[] => {
  const branch = manager.getBranch();
  let start = 0;
  for (let index = 0; index < branch.length; index++) {
    if (branch[index]!.type === "compaction") start = index + 1;
  }
  return branch
    .slice(start)
    .filter(
      (entry: SessionEntry) =>
        entry.type === "custom" && entry.customType === TOOL_PRUNING_ENTRY_TYPE,
    )
    .map((entry) => (entry as { data?: unknown }).data as ToolPruningEpochEntry);
};

/** Whether Pi wrote a `compaction` entry on the active branch. */
const hasCompactionEntry = (manager: SessionManager): boolean =>
  manager
    .getBranch()
    .some((entry: SessionEntry) => entry.type === "compaction");

/** Entry of the user Message that opened the first Turn. */
const firstUserMessageEntry = (manager: SessionManager): SessionEntry => {
  const entry = manager
    .getBranch()
    .find(
      (candidate: SessionEntry) =>
        candidate.type === "message" && candidate.message.role === "user",
    );
  if (entry === undefined) throw new Error("The branch has no user message");
  return entry;
};

// ---------------------------------------------------------------------------
// Scripted Gateway responders
// ---------------------------------------------------------------------------

/** Plays one scripted chat reply per `/v1/chat/completions` call. */
function scriptedChat(replies: readonly (() => ChatReply)[]) {
  let index = 0;
  return (): ChatReply => {
    const reply = replies[index];
    index += 1;
    if (reply === undefined) {
      throw new Error(`Unscripted /v1/chat/completions call #${index}`);
    }
    return reply();
  };
}

const questionNames = (request: DecisionsRequest): string[] =>
  Object.keys(request.questions ?? {});

/** Candidate ids (`c1`…) a decision request asks about. */
const askedCandidateIds = (request: DecisionsRequest): string[] => [
  ...new Set(
    questionNames(request).map((name) => name.slice(name.indexOf("_") + 1)),
  ),
];

/**
 * Per-candidate `noul` answers: a number applies to both questions of the
 * candidate, an object narrows the answer to one kind. Questions without an
 * entry keep the toolkit default (`0.5`), i.e. the uncertain band the policy
 * preserves.
 */
type CandidateAnswer = number | { result?: number; call?: number };

function noulAnswerer(
  byCandidate: Readonly<Record<string, CandidateAnswer>>,
): (request: DecisionsRequest) => OperationReply {
  return (request) => {
    const nouls: Record<string, number> = {};
    for (const name of questionNames(request)) {
      const kind = name.slice(0, name.indexOf("_"));
      const candidateId = name.slice(name.indexOf("_") + 1);
      const answer = byCandidate[candidateId];
      if (answer === undefined) continue;
      const probability =
        typeof answer === "number"
          ? answer
          : kind === "call"
            ? answer.call
            : answer.result;
      if (probability !== undefined) nouls[name] = probability;
    }
    return decisionsResponse(request, { nouls });
  };
}

/** Only the oldest candidate is retired; the rest of the pool stays eligible. */
const DROP_OLDEST = noulAnswerer({ c1: 0.01 });

/** Every candidate dropped in its most aggressive legal way (drop_call / drop_result). */
const DROP_EVERYTHING = noulAnswerer({
  c1: 0.01,
  c2: 0.01,
  c3: 0.01,
  c4: 0.01,
  c5: 0.01,
  c6: 0.01,
  c7: 0.01,
  c8: 0.01,
});

/** Every candidate kept: the uncertain-band answer the policy preserves. */
const KEEP_EVERYTHING = noulAnswerer({ c1: 0.9, c2: 0.9, c3: 0.9, c4: 0.9 });

/**
 * `drop_call` for the oldest candidate (both questions low) and `drop_result`
 * for the newer one (its call stays, only the body is obsolete); everything
 * else keeps the toolkit's uncertain-band answer.
 */
const DROP_CALL_THEN_RESULT = noulAnswerer({ c1: 0.05, c2: { result: 0.05 } });

// ---------------------------------------------------------------------------
// Session harness
// ---------------------------------------------------------------------------

interface PruningTrace {
  events: { level: string; name: string; payload?: unknown }[];
  logger: ToolPruningTraceLogger;
}

function createPruningTrace(): PruningTrace {
  const events: PruningTrace["events"] = [];
  const record =
    (level: string) =>
    (name: string, payload?: unknown): void => {
      events.push({ level, name, payload });
    };
  return {
    events,
    logger: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
  };
}

const traceEventNames = (trace: PruningTrace): string[] =>
  trace.events.map((event) => event.name);

interface OpenSessionOptions {
  ctx: TestWorkerContext;
  /** `WorkerRuntimeConfig.toolPruning` overrides, published through the bridge. */
  config?: ToolPruningConfigOverrides;
  /** Reuse a persisted manager (cold reload) instead of a fresh in-memory one. */
  manager?: SessionManager;
  trace?: PruningTrace;
  tools?: ToolDefinition[];
}

/**
 * Composes a real Pi session the way the worker does: sandbox paths, the
 * worker's `ModelRuntime` (Gateway catalog + credentials from the sandbox
 * files), the first-party extension paths (Tool Pruning included, loaded
 * through jiti) and the `toolPruning` overrides published through the global
 * symbol bridge.
 */
async function openSession(options: OpenSessionOptions): Promise<AgentSession> {
  const { ctx } = options;
  publishToolPruningBridge({
    ...(options.config === undefined ? {} : { config: options.config }),
    ...(options.trace === undefined ? {} : { traceLogger: () => options.trace!.logger }),
  });

  const cwd = join(ctx.root, "project");
  mkdirSync(cwd, { recursive: true });

  const modelRuntime = await getModelRuntime(ctx.workerConfig);
  const model = modelRuntime.getModel(GATEWAY_PROVIDER_ID, MODEL_ID);
  if (model === undefined) throw new Error(`The Gateway catalog did not publish ${MODEL_ID}`);

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: ctx.agentDir,
    noSkills: true,
    additionalExtensionPaths: getExtensionPaths(undefined, ctx.workerConfig),
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    agentDir: ctx.agentDir,
    model,
    modelRuntime,
    resourceLoader,
    sessionManager: options.manager ?? SessionManager.inMemory(cwd),
    noTools: "all",
    customTools: options.tools ?? TOOLS,
    tools: ACTIVE_TOOLS,
  });
  await session.bindExtensions({ mode: "rpc" });
  cleanups.push(() => session.dispose());
  return session;
}

/** Drives one Turn per prompt, in order. */
async function driveTurns(session: AgentSession, prompts: readonly string[]): Promise<void> {
  for (const prompt of prompts) await session.prompt(prompt);
}

let cleanups: (() => void)[] = [];

function sandbox(): TestWorkerContext {
  const ctx = createTestWorkerContext({
    gatewayUrl: GATEWAY_URL,
    apiKey: GATEWAY_API_KEY,
  });
  cleanups.push(() => ctx.cleanup());
  return ctx;
}

const gatewayHarness = setupWorkerGatewayHarness();

beforeEach(() => {
  // The ModelRuntime and the synced catalog are process-wide caches keyed by
  // config; a sandbox is a different config, so both start clean.
  resetModelRuntimeForTests();
  resetGatewayCatalogForTests();
});

afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup();
  cleanups = [];
  resetToolPruningBridgeForTests();
});

// ---------------------------------------------------------------------------
// 1. Below the watermark
// ---------------------------------------------------------------------------

describe("Tool Pruning session integration", () => {
  it("keeps a short session out of the Epoch path: no judge call, byte-identical provider messages", async () => {
    const ctx = sandbox();

    // Two Turns of cheap exploration, nowhere near the spec watermarks.
    const script = (): (() => ChatReply)[] => [
      () => explorationCalls("t1"),
      () => textReply("Explored the files."),
      () => textReply("Summarised what I found."),
    ];

    // Baseline: the same script with Tool Pruning switched off.
    const baselineScenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat(script()),
    });
    const baseline = await openSession({
      ctx,
      config: { enabled: false },
      tools: SMALL_TOOLS,
    });
    await driveTurns(baseline, ["explore", "summarise"]);

    // Subject: the spec defaults, bridged through `WorkerRuntimeConfig`.
    const scenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat(script()),
    });
    const session = await openSession({ ctx, config: {}, tools: SMALL_TOOLS });
    await driveTurns(session, ["explore", "summarise"]);

    // Zero Epochs, zero HTTP calls to the judge (spec D3: short sessions pay no
    // latency and keep the provider's cached prefix intact).
    expect(systemOneRequests(scenario)).toHaveLength(0);
    expect(pruningEntries(session.sessionManager)).toHaveLength(0);

    // Byte-identical provider messages: below the watermarks, enabling Tool
    // Pruning changes nothing at all in the request the model receives.
    const enabledPayloads = chatPayloads(scenario).map((payload) =>
      JSON.stringify(payload.messages),
    );
    const baselinePayloads = chatPayloads(baselineScenario).map((payload) =>
      JSON.stringify(payload.messages),
    );
    expect(enabledPayloads).toHaveLength(3);
    expect(enabledPayloads).toEqual(baselinePayloads);

    // The spec's first step is 45 % of the window; this session sits orders of
    // magnitude below it, which is what makes "no Epoch" the only correct
    // answer while the tie-breakers below stay at their spec defaults.
    const payload = latestPayload(scenario);
    expect(payloadTokens(payload)).toBeLessThan(0.45 * CONTEXT_WINDOW);

    // The payloads really carried the tool results: a projection that hid them
    // would pass the comparison above for the wrong reason.
    expectPairedPayload(payload);
    expect(providerResultText(payload, "t1read")).toBe(SMALL_RESULT);
  });

  // -------------------------------------------------------------------------
  // 2. Monotonic watermark progression
  // -------------------------------------------------------------------------

  it("prunes once per watermark step and never re-triggers on an already-consumed step", async () => {
    const ctx = sandbox();
    const trace = createPruningTrace();

    let judgeCall = 0;
    const decisions = (request: DecisionsRequest): OperationReply => {
      judgeCall += 1;
      // First Epoch: the oldest candidate is dropped entirely, the next one
      // only loses its body (both D2 branches in one provider payload). The
      // second Epoch, once the staircase allows it again, retires the rest.
      return (judgeCall === 1 ? DROP_CALL_THEN_RESULT : DROP_EVERYTHING)(request);
    };

    const scenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat([
        () => explorationCalls("t1"),
        () => textReply("Explored the files."),
        () => textReply("Moved on to the next sub-task."),
        () => explorationCalls("t3", 3, "src/b.ts"),
        () => textReply("Explored two more files."),
        () => textReply("Nothing left to prune."),
      ]),
      decisions,
    });

    const session = await openSession({ ctx, config: STAIRCASE, trace });
    await driveTurns(session, ["explore", "carry on"]);

    // One Epoch, armed by the steps the first Turn's context crossed.
    const judgeCalls = systemOneRequests(scenario);
    expect(judgeCalls).toHaveLength(1);
    // Candidate ids are ranked by the batcher, so only the set is contractual.
    expect(askedCandidateIds(judgeCalls[0]!.body as DecisionsRequest).sort()).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
    expect(traceEventNames(trace)).toContain("tool_pruning.epoch_completed");

    // The provider receives the pruned projection: c1 gone, c2 stubbed, the
    // execution tool and the other result untouched, pairing intact.
    const prunedPayload = latestPayload(scenario);
    expectPairedPayload(prunedPayload);
    expect(providerCallIds(prunedPayload)).toEqual(["t1read", "t1bash", "t1grep2"]);
    const stub = providerResultText(prunedPayload, "t1read");
    expect(stub).toContain(stubMarker("read", bigResult("READ")));
    expect(stub).toContain("HEAD-READ");
    expect(stub).toContain("TAIL-READ");
    expect(stub.length).toBeLessThan(1_000);
    expect(providerResultText(prunedPayload, "t1bash")).toBe(bigResult("BASH"));

    // The Epoch consumed the highest step the context had already reached, so
    // `0.10` came with it: both are spent on this branch (spec D3).
    const firstEntries = pruningEntries(session.sessionManager);
    expect(firstEntries).toHaveLength(1);
    expect(firstEntries[0]!.watermark).toBe(0.35);
    expect(firstEntries[0]!.decisions).toEqual({ t1grep: "drop_call", t1read: "drop_result" });
    expect(firstEntries[0]!.stats.deterministicDrops).toBe(0);
    expect(firstEntries[0]!.stats.judgeDrops).toBe(2);
    expect(firstEntries[0]!.tokensSavedEst).toBeGreaterThan(BIG_RESULT_TOKENS);

    // The Turn after the prune runs at ~20 % of the window: still above the
    // retired `0.10` step, with three unmasked results worth pruning. A
    // staircase that re-armed a lower step would judge here; the monotonic one
    // does not, because `0.35` was consumed together with `0.10`.
    const replayedPayload = latestPayload(scenario);
    expect(payloadTokens(replayedPayload)).toBeGreaterThan(0.1 * CONTEXT_WINDOW);
    expect(payloadTokens(replayedPayload)).toBeLessThan(0.35 * CONTEXT_WINDOW);
    expect(systemOneRequests(scenario)).toHaveLength(1);
    expect(pruningEntries(session.sessionManager)).toHaveLength(1);

    // Crossing the NEXT step is the only thing that brings the judge back;
    // the retired steps are still spent.
    await driveTurns(session, ["explore more"]);

    const allJudgeCalls = systemOneRequests(scenario);
    expect(allJudgeCalls).toHaveLength(2);
    expect(askedCandidateIds(allJudgeCalls[1]!.body as DecisionsRequest).sort()).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
      "c6",
    ]);
    const entries = pruningEntries(session.sessionManager);
    expect(entries).toHaveLength(2);
    expect(entries[1]!.watermark).toBe(0.55);

    // After the second Epoch only the traces of the execution tool survive as
    // bodies: `bash` never receives `drop_call` (spec D2), and `t1read` keeps
    // its call block with the stub already written by the first Epoch.
    const finalPayload = latestPayload(scenario);
    expectPairedPayload(finalPayload);
    expect(providerCallIds(finalPayload)).toEqual(["t1read", "t1bash", "t3bash"]);
    expect(providerResultText(finalPayload, "t1read")).toContain(
      stubMarker("read", bigResult("READ")),
    );
    expect(providerResultText(finalPayload, "t1bash")).toContain(
      stubMarker("bash", bigResult("BASH")),
    );
    expect(providerResultText(finalPayload, "t3bash")).toContain(
      stubMarker("bash", bigResult("BASH")),
    );

    // The session transcript — what the Coding Agent UI and the event log
    // render — keeps every tool call and every full result.
    expect(transcriptResultText(session, "t1grep")).toBe(bigResult("ALPHA"));
    expect(transcriptResultText(session, "t1read")).toBe(bigResult("READ"));
    expect(transcriptResultText(session, "t3read")).toBe(bigResult("READ"));
    expect(
      session.messages.filter((message) => message.role === "toolResult"),
    ).toHaveLength(FIRST_TURN_IDS.length * 2);

    // After dropping all candidates down to ~1 % of the window, a short prose
    // Turn stays below the lowest step (and has 0 prunable tokens), so no Epoch runs.
    await driveTurns(session, ["wrap up"]);
    expect(systemOneRequests(scenario)).toHaveLength(2);
    expect(pruningEntries(session.sessionManager)).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 3. Cold reload
  // -------------------------------------------------------------------------

  it("reapplies the persisted masks and consumed steps after a cold reload without asking the judge again", async () => {
    const ctx = sandbox();
    const cwd = join(ctx.root, "project");
    mkdirSync(cwd, { recursive: true });

    // The session file lives in the sandbox, like the worker's own.
    const manager = SessionManager.create(cwd, ctx.sessionsDir);

    const firstScenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat([
        () => explorationCalls("t1"),
        () => textReply("Explored the files."),
        () => textReply("First turn after the prune."),
      ]),
      // Only the oldest pair is retired, so the branch still holds three
      // unmasked results worth pruning: a reloaded runner that lost the
      // consumed step would fire `0.10` at ~20 % of the window.
      decisions: DROP_OLDEST,
    });

    const session = await openSession({ ctx, config: STAIRCASE, manager });
    await driveTurns(session, ["explore", "continue"]);
    expect(systemOneRequests(firstScenario)).toHaveLength(1);

    const entriesBeforeReload = pruningEntries(manager);
    expect(entriesBeforeReload).toHaveLength(1);
    expect(entriesBeforeReload[0]!.watermark).toBe(0.35);
    expect(entriesBeforeReload[0]!.decisions).toEqual({ t1grep: "drop_call" });

    // The pruned projection the provider received before the reload: the
    // dropped call is gone, the three survivors still carry their bodies.
    const prunedPayload = latestPayload(firstScenario);
    expectPairedPayload(prunedPayload);
    expect(providerCallIds(prunedPayload)).toEqual(["t1read", "t1bash", "t1grep2"]);
    expect(providerResultText(prunedPayload, "t1read")).toBe(bigResult("READ"));
    expect(payloadTokens(prunedPayload)).toBeGreaterThan(0.1 * CONTEXT_WINDOW);

    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeDefined();
    session.dispose();

    // Cold reload: a brand-new Pi session over the on-disk transcript, and a
    // fresh MSW phase so every request recorded below happened after it.
    const secondScenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat([() => textReply("Resumed the session from disk.")]),
      decisions: KEEP_EVERYTHING,
    });
    const reloaded = await openSession({
      ctx,
      config: STAIRCASE,
      manager: SessionManager.open(sessionFile!),
    });
    await driveTurns(reloaded, ["carry on"]);

    // The masks came back from `getBranch()`: the dropped call stays gone and
    // the survivors stay whole.
    const payload = latestPayload(secondScenario);
    expectPairedPayload(payload);
    expect(providerCallIds(payload)).toEqual(["t1read", "t1bash", "t1grep2"]);
    expect(providerResultText(payload, "t1read")).toBe(bigResult("READ"));
    expect(providerResultText(payload, "t1bash")).toBe(bigResult("BASH"));

    // ...and so did the consumed step: at ~20 % of the window `0.10` and
    // `0.35` are spent and `0.55` is out of reach, so no Epoch ran. Had the
    // step been rebuilt as `0`, the three prunable results above would have
    // re-opened the judge on this very Turn.
    expect(systemOneRequests(secondScenario)).toHaveLength(0);
    expect(pruningEntries(reloaded.sessionManager)).toHaveLength(1);

    // The reloaded transcript still holds the original, unpruned payloads and
    // the persisted Epoch entry.
    expect(transcriptResultText(reloaded, "t1grep")).toBe(bigResult("ALPHA"));
    expect(transcriptResultText(reloaded, "t1read")).toBe(bigResult("READ"));
    expect(transcriptResultText(reloaded, "t1bash")).toBe(bigResult("BASH"));
  });

  // -------------------------------------------------------------------------
  // 4. Message Edit
  // -------------------------------------------------------------------------

  it("abandons the masks and the consumed step of a rewound branch after a Message Edit", async () => {
    const ctx = sandbox();
    const trace = createPruningTrace();

    let judgeCall = 0;
    const decisions = (request: DecisionsRequest): OperationReply => {
      judgeCall += 1;
      return (judgeCall === 1 ? DROP_EVERYTHING : KEEP_EVERYTHING)(request);
    };

    const scenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat([
        () => explorationCalls("t1"),
        () => textReply("Explored the files."),
        () => textReply("Second turn."),
        () => explorationCalls("t3", 3),
        () => textReply("Explored again."),
      ]),
      decisions,
    });

    const session = await openSession({ ctx, config: STAIRCASE, trace });
    await driveTurns(session, ["explore", "continue"]);

    // The first Epoch pruned the exploration Turn and persisted its entry.
    expect(systemOneRequests(scenario)).toHaveLength(1);
    expect(providerCallIds(latestPayload(scenario))).toEqual(["t1bash"]);
    expect(pruningEntries(session.sessionManager)).toHaveLength(1);
    // `0.35` was consumed, so with the branch intact no further Epoch is due
    // until `0.55`: the second Epoch below can only come from the rewind.
    expect(pruningEntries(session.sessionManager)[0]!.watermark).toBe(0.35);

    // Message Edit: rewind to the user Message that opened the pruned Turn, so
    // that Turn and its Epoch entry end up in the Abandoned Branch.
    const target = firstUserMessageEntry(session.sessionManager);
    const rewind = await session.navigateTree(target.id, { summarize: false });
    expect(rewind.cancelled).toBe(false);
    expect(pruningEntries(session.sessionManager)).toHaveLength(0);

    await driveTurns(session, ["explore again"]);

    // The new Epoch judged the new pairs from scratch and answered "keep", so
    // the provider gets the ORIGINAL bodies. Had the abandoned Epoch's masks
    // survived, the payload would still carry its stubs and dropped calls.
    expect(systemOneRequests(scenario)).toHaveLength(2);
    const payload = latestPayload(scenario);
    expectPairedPayload(payload);
    expect(providerCallIds(payload)).toEqual(["t3grep", "t3read", "t3bash", "t3grep2"]);
    expect(providerResultText(payload, "t3read")).toBe(bigResult("READ"));
    expect(providerResultText(payload, "t3bash")).toBe(bigResult("BASH"));
    expect(JSON.stringify(payload.messages)).not.toContain("Tool Pruning: omitted");

    // Two Epochs ran. The second one persisted an entry with no decisions at
    // all: `keep` is never terminal, but the entry is what consumes the step.
    expect(
      traceEventNames(trace).filter((name) => name === "tool_pruning.epoch_completed"),
    ).toHaveLength(2);
    const entries = pruningEntries(session.sessionManager);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.decisions).toEqual({});
    expect(entries[0]!.watermark).toBe(0.35);
  });

  // -------------------------------------------------------------------------
  // 5. Compaction rearm
  // -------------------------------------------------------------------------

  it("rearms the whole staircase after Pi compacts the session", async () => {
    const ctx = sandbox();
    const trace = createPruningTrace();

    let judgeCalls = 0;
    const decisions = (request: DecisionsRequest): OperationReply => {
      judgeCalls += 1;
      // The pre-compaction Epoch retires one pair, the post-compaction one
      // keeps everything it judges: the second Epoch can only exist because
      // the staircase was rearmed, never because a mask was left behind.
      return (judgeCalls === 1 ? DROP_OLDEST : KEEP_EVERYTHING)(request);
    };

    const scenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat([
        () => explorationCalls("t1"),
        () => textReply("Explored the files."),
        () => textReply("Moved on before compacting."),
        // Pi's own summarisation call for the manual compaction below.
        () => textReply("SUMMARY: explored src/a.ts and ran the tests."),
        () => explorationCalls("t4", 4),
        () => textReply("Resumed after the compaction."),
        () => textReply("Settled."),
      ]),
      decisions,
    });

    const session = await openSession({ ctx, config: STAIRCASE, trace });
    await driveTurns(session, ["explore", "carry on"]);

    // Pre-compaction: the first Epoch consumed `0.35` and dropped `t1grep`.
    expect(systemOneRequests(scenario)).toHaveLength(1);
    const before = pruningEntries(session.sessionManager);
    expect(before).toHaveLength(1);
    expect(before[0]!.watermark).toBe(0.35);
    expect(before[0]!.decisions).toEqual({ t1grep: "drop_call" });
    expect(providerCallIds(latestPayload(scenario))).toEqual(["t1read", "t1bash", "t1grep2"]);

    // Pi compacts the session for real — the same path `/compact` takes:
    // one summarisation call through the Gateway, then `appendCompaction()`
    // writes the `compaction` entry Pi's own resume path reads.
    await session.compact();
    expect(hasCompactionEntry(session.sessionManager)).toBe(true);
    expect(session.messages.some((message) => message.role === "compactionSummary")).toBe(true);

    // The entry that consumed `0.35` is behind the compaction boundary, so the
    // runner resets its watermark floor to `0` (while retaining masks on the
    // active branch so any pruned call inside Pi's kept tail stays masked).
    expect(pruningEntries(session.sessionManager)).toHaveLength(1);
    expect(pruningEntriesSinceCompaction(session.sessionManager)).toHaveLength(0);

    // The summarised Turn's tool results are gone with the summary, so the
    // staircase is exercised by the next Turn of real payloads: four results,
    // ~40 % of the window, past the rearmed `0.10` and `0.35` steps.
    await driveTurns(session, ["explore again"]);

    expect(systemOneRequests(scenario)).toHaveLength(2);
    const after = pruningEntriesSinceCompaction(session.sessionManager);
    expect(after).toHaveLength(1);
    // The same step as before the compaction: an Epoch only consumes the
    // highest step the context reached, and the staircase restarted at its
    // bottom. Had the consumed step survived the compaction, `0.55` would be
    // the next armed step and nothing would have fired at 40 %.
    expect(after[0]!.watermark).toBe(0.35);
    expect(traceEventNames(trace).filter((name) => name === "tool_pruning.epoch_completed"))
      .toHaveLength(2);

    // The judge kept every candidate of the new cycle, so the provider receives
    // the four bodies unmasked: no mask of the previous cycle leaks past the
    // compaction boundary.
    const payload = latestPayload(scenario);
    expectPairedPayload(payload);
    expect(providerCallIds(payload)).toEqual(["t4grep", "t4read", "t4bash", "t4grep2"]);
    expect(providerResultText(payload, "t4read")).toBe(bigResult("READ"));
    expect(JSON.stringify(payload.messages)).not.toContain("Tool Pruning: omitted");
    expect(payloadTokens(payload)).toBeGreaterThan(0.35 * CONTEXT_WINDOW);

    // The Compaction Summary Pi produced replaces the summarised history and
    // reaches the provider verbatim; Tool Pruning never prunes it (spec D2).
    expect(JSON.stringify(payload.messages)).toContain("SUMMARY: explored src/a.ts");

    // Every step above `0.35` is still armed and the context stays below
    // `0.55`, so a further prose Turn judges nothing.
    await driveTurns(session, ["settle"]);
    expect(systemOneRequests(scenario)).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 6. Fail-open
  // -------------------------------------------------------------------------

  it("fails open on a judge error, keeps the Turn alive and re-judges only at the next watermark step", async () => {
    const ctx = sandbox();
    const trace = createPruningTrace();

    let judgeCalls = 0;
    const decisions = (request: DecisionsRequest): OperationReply => {
      judgeCalls += 1;
      return judgeCalls === 1
        ? { status: 500, body: { error: { message: "systemone unavailable" } } }
        : KEEP_EVERYTHING(request);
    };

    const scenario = gatewayHarness.use({
      catalog: { public: catalog },
      chat: scriptedChat([
        () => explorationCalls("t1"),
        () => textReply("Explored the files."),
        () => textReply("Failing-judge turn survived."),
        () => textReply("Prose turn, no new tool output."),
        () => explorationCalls("t2", 2),
        () => textReply("Explored two more files."),
        () => textReply("Cooldown satisfied, judged again."),
      ]),
      decisions,
    });

    const session = await openSession({
      ctx,
      config: STAIRCASE,
      trace,
    });

    // Turn 1: the Epoch armed by the crossed steps hits a 500.
    await driveTurns(session, ["explore", "continue"]);

    expect(systemOneRequests(scenario)).toHaveLength(1);
    expect(traceEventNames(trace)).toContain("tool_pruning.epoch_failed_open");
    // Fail-open with nothing from Phase 0 to apply: the Turn completes
    // untouched, but the entry that persists the consumed step is what keeps a
    // degraded judge from being asked again on the same step (spec D6).
    const failedEntries = pruningEntries(session.sessionManager);
    expect(failedEntries).toHaveLength(1);
    expect(failedEntries[0]!.decisions).toEqual({});
    expect(failedEntries[0]!.stats.failedOpen).toBe(true);
    expect(failedEntries[0]!.watermark).toBe(0.35);
    const failedPayload = latestPayload(scenario);
    expectPairedPayload(failedPayload);
    expect(providerResultText(failedPayload, "t1grep")).toBe(bigResult("ALPHA"));
    expect(providerResultText(failedPayload, "t1read")).toBe(bigResult("READ"));

    // Prose-only Turn below the next step: a degraded service cannot turn into
    // a retry storm, because `0.10` and `0.35` are spent.
    await driveTurns(session, ["what does the file do?"]);
    expect(systemOneRequests(scenario)).toHaveLength(1);

    // The next Turn of results crosses `0.55`, so the still-eligible pool is
    // judged again, together with the new pairs.
    await driveTurns(session, ["explore more"]);
    expect(systemOneRequests(scenario)).toHaveLength(2);

    // Every reachable step is consumed now: another prose Turn asks nothing.
    await driveTurns(session, ["continue again"]);
    expect(systemOneRequests(scenario)).toHaveLength(2);

    // The candidates the failed Epoch could not judge were never immortalised:
    // they are all back in front of the judge, together with the new ones.
    // Eight pairs in total, seven candidates: Phase 0 superseded the first
    // Turn's `read(src/a.ts)` with the second Turn's read of the same full file
    // (spec D5 Phase 0), so only seven reached the judge.
    const secondRequest = systemOneRequests(scenario)[1]!.body as DecisionsRequest;
    expect(askedCandidateIds(secondRequest).sort()).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
      "c6",
      "c7",
    ]);

    // The second Epoch answered "keep" for everything it judged, so only the
    // deterministic supersession drop is persisted and the provider receives
    // the original bodies of the results the judge preserved.
    const finalPayload = latestPayload(scenario);
    expectPairedPayload(finalPayload);
    expect(providerCallIds(finalPayload)).not.toContain("t1read");
    expect(providerResultText(finalPayload, "t1grep")).toBe(bigResult("ALPHA"));
    expect(providerResultText(finalPayload, "t2bash")).toBe(bigResult("BASH"));
    expect(transcriptResultText(session, "t2read")).toBe(bigResult("READ"));

    const entries = pruningEntries(session.sessionManager);
    expect(entries).toHaveLength(2);
    expect(entries[1]!.watermark).toBe(0.55);
    expect(entries[1]!.decisions).toEqual({ t1read: "drop_call" });
    expect(entries[1]!.stats.deterministicDrops).toBe(1);
    expect(entries[1]!.stats.judgeDrops).toBe(0);
    expect(entries[1]!.stats.failedOpen).toBeUndefined();
  });
});
