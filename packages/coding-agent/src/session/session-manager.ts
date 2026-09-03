import path from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { createAgentSessionRuntime, SessionManager, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { config } from "config";
import { getTraceLogger } from "tracing";
import { getSupportedThinkingLevels } from "models";
import type { ThinkingLevel, ThinkingLevelMap } from "models";
import { SessionEventLog, type Cursor } from "../agui/event-log";
import { getAuthJsonPath, getModelsJsonPath } from "../runtime/models";
import { getCodingAgentDir, getSessionsDir } from "../runtime/paths";
import { startSubagentCollector } from "../subagent/subagent-collector";
import type { SubagentRunParams, SubagentDetails, SubagentRunResult } from "../subagent/subagent-bridge";
import { sessionRegistry } from "./session-registry";
import { TurnRunner, applyThinkingLevel } from "./turn-runner";
import { SessionQueries } from "./session-queries";
import type { PromptSummary } from "../runtime/prompts";
import { resolveProjectPath } from "./session-entry";
import { makeCreateRuntime } from "../runtime/runtime-factory";

export { FILES_CHANGED_EVENT } from "./turn-runner";

export interface CodingAgentSkill {
  name: string;
  description: string;
}

const turnRunner = new TurnRunner(sessionRegistry);
const queries = new SessionQueries(sessionRegistry);

// Keep type for SnapshotMessage (used by sendPrompt signature)
interface SnapshotMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

// Re-export facade methods (contract stable with transports/http.ts)

export interface GetOrCreateSessionOptions {
  userId: string;
  project: string;
  sessionId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
}

export async function getOrCreateSession(options: GetOrCreateSessionOptions): Promise<{ sessionId: string }> {
  return sessionRegistry.getOrCreateSession(options);
}

// sendPrompt now carries modelId/thinkingLevel as turn config (b1)
// Keep backward compat: callers may pass runId as string, or omit model/thinking.
// New callers pass modelId/thinkingLevel via options object or as extra args.
export async function sendPrompt(
  sessionId: string,
  prompt: string,
  messages?: SnapshotMessage[],
  runId: string = crypto.randomUUID(),
  modelIdOrOptions?: string | { modelId?: string; thinkingLevel?: ThinkingLevel },
  thinkingLevel?: ThinkingLevel,
): Promise<ReadableStream<Uint8Array>> {
  let modelId: string | undefined;
  let level: ThinkingLevel | undefined;
  if (typeof modelIdOrOptions === "string") {
    modelId = modelIdOrOptions;
    level = thinkingLevel;
  } else if (modelIdOrOptions && typeof modelIdOrOptions === "object") {
    modelId = (modelIdOrOptions as { modelId?: string }).modelId;
    level = (modelIdOrOptions as { thinkingLevel?: ThinkingLevel }).thinkingLevel;
  }
  return turnRunner.sendPrompt(sessionId, prompt, messages, runId, { modelId, thinkingLevel: level });
}

export async function getSessionMessages(
  sessionId: string,
  project?: string,
  parentSessionId?: string,
): Promise<Array<any>> {
  return queries.getSessionMessages(sessionId, project, parentSessionId);
}

export function getSessionSkills(sessionId: string): CodingAgentSkill[] {
  return queries.getSessionSkills(sessionId);
}

export function getSessionPrompts(sessionId: string): PromptSummary[] {
  return queries.getSessionPrompts(sessionId);
}

export function resolvePrompt(
  sessionId: string,
  promptName: string,
  values: Record<string, string>,
): { text: string } {
  return queries.resolvePrompt(sessionId, promptName, values);
}

export async function getAvailableModels(): Promise<
  Array<{ providerId: string; modelId: string; label: string; levels: ThinkingLevel[] }>
> {
  const log = getTraceLogger("worker");
  log.info("models.fetch");
  const authStorage = AuthStorage.create(getAuthJsonPath());
  const registry = ModelRegistry.create(authStorage, getModelsJsonPath());
  const available = registry.getAvailable();
  const filtered = available.map((model) => ({
    providerId: model.provider,
    modelId: model.id,
    label: `${model.provider}/${model.id}`,
    levels: getSupportedThinkingLevels(
      model.reasoning,
      (model as { thinkingLevelMap?: ThinkingLevelMap }).thinkingLevelMap,
    ),
  }));
  log.info("models.result", { count: filtered.length });
  return filtered;
}

export async function getSessionModel(
  sessionId: string,
  project?: string,
): Promise<{ providerId: string; modelId: string } | null> {
  return queries.getSessionModel(sessionId, project);
}

export async function getSessionThinkingLevel(
  sessionId: string,
  project?: string,
): Promise<{ level: ThinkingLevel; levels: ThinkingLevel[] } | null> {
  return queries.getSessionThinkingLevel(sessionId, project);
}

export async function disposeSession(sessionId: string): Promise<void> {
  return sessionRegistry.disposeSession(sessionId);
}

export interface SessionStatus {
  running: boolean;
}
/**
 * HTTP-border cursor: same shape as the event log's `Cursor`. The session
 * snapshot emits it; connectToSession consumes it back.
 */
export type SessionCursor = Cursor;
export interface SessionSnapshot {
  messages: Array<any>;
  cursor: SessionCursor | null;
  running: boolean;
}

export async function getSessionStatus(sessionId: string, parentSessionId?: string): Promise<SessionStatus> {
  return queries.getSessionStatus(sessionId, parentSessionId);
}

export async function getSessionSnapshot(
  sessionId: string,
  project?: string,
  parentSessionId?: string,
): Promise<SessionSnapshot> {
  return queries.getSessionSnapshot(sessionId, project, parentSessionId);
}

export async function connectToSession(
  sessionId: string,
  cursor: Cursor,
  parentSessionId?: string,
): Promise<ReadableStream<Uint8Array>> {
  return turnRunner.connectToSession(sessionId, cursor, parentSessionId);
}

export async function cancelRun(sessionId: string): Promise<{
  cancelled: boolean;
  cleared: { steering: string[]; followUp: string[] };
}> {
  return turnRunner.cancelRun(sessionId);
}

export async function followUp(
  sessionId: string,
  text: string,
): Promise<{
  queued: boolean;
  pending: { steering: string[]; followUp: string[] };
}> {
  return turnRunner.followUp(sessionId, text);
}

export async function clearQueue(sessionId: string): Promise<{
  cleared: { steering: string[]; followUp: string[] };
  pending: { steering: string[]; followUp: string[] };
}> {
  return turnRunner.clearQueue(sessionId);
}

export async function steer(
  sessionId: string,
  text: string,
): Promise<{
  steered: boolean;
  cleared: { steering: string[]; followUp: string[] };
  pending: { steering: string[]; followUp: string[] };
}> {
  return turnRunner.steer(sessionId, text);
}

export async function getSubagentSessionForToolCall(
  parentSessionId: string,
  toolCallId: string,
): Promise<{ subSessionId: string }> {
  return queries.getSubagentSessionForToolCall(parentSessionId, toolCallId);
}

// Helpers previously exported, now internal but kept for backwards compat with surviving test

export function resolveSubagentCwd(
  projectCwd: string,
  cwdParam?: string,
): { ok: true; cwd: string } | { ok: false; error: string } {
  if (!cwdParam) return { ok: true, cwd: projectCwd };
  const resolved = path.resolve(projectCwd, cwdParam);
  const rel = path.relative(projectCwd, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `cwd must resolve inside the project root: ${cwdParam}` };
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return { ok: false, error: `cwd is not an existing directory: ${cwdParam}` };
  }
  return { ok: true, cwd: resolved };
}

export function resolveSubagentModelId(
  parentModel: { provider: string; id: string } | undefined,
  available: string[],
  modelParam?: string,
): { ok: true; modelId?: string } | { ok: false; error: string } {
  if (!modelParam) {
    return { ok: true, modelId: parentModel ? `${parentModel.provider}/${parentModel.id}` : undefined };
  }
  if (available.includes(modelParam)) return { ok: true, modelId: modelParam };
  return {
    ok: false,
    error: `Unknown model "${modelParam}". Available models: ${available.join(", ")}`,
  };
}

export function ensureSubagentSessionsDir(sessionsDir: string): string {
  const dir = path.join(sessionsDir, "subagents");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Keep applyThinkingLevel export for deleted test compatibility (no-op after b1, delegated to turnRunner)
export { applyThinkingLevel };

export type {
  SubagentRunParams,
  SubagentDetails,
  SubagentRunResult,
} from "../subagent/subagent-bridge";

function lastAssistantText(messages: ReadonlyArray<any>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((c: any) => c?.type === "text")
        .map((c: any) => c.text ?? "")
        .join("\n");
    }
    return "";
  }
  return "";
}

export async function runSubagent(
  parentSessionId: string,
  toolCallId: string,
  params: SubagentRunParams,
  signal?: AbortSignal,
): Promise<SubagentRunResult> {
  const log = getTraceLogger("worker");
  const parent = sessionRegistry.getRaw(parentSessionId);
  if (!parent) throw new Error(`Parent session not found for session ${parentSessionId}`);

  const failedDetails = (): SubagentDetails => ({
    subSessionId: "",
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    description: params.description,
  });
  const errorResult = (error: string): SubagentRunResult => ({
    content: [{ type: "text", text: error }],
    details: failedDetails(),
    isError: true,
  });

  const projectsRoot = config.codingAgentProjectsRoot();
  const parentCwd = resolveProjectPath(projectsRoot, parent.project);

  const cwdResult = resolveSubagentCwd(parentCwd, params.cwd);
  if (!cwdResult.ok) return errorResult(cwdResult.error);

  const available = (await getAvailableModels()).map((m) => m.label);
  const modelResult = resolveSubagentModelId(parent.runtime.session.model, available, params.model);
  if (!modelResult.ok) return errorResult(modelResult.error);

  const subSessionId = crypto.randomUUID();
  const sessionManager = SessionManager.create(
    ensureSubagentSessionsDir(getSessionsDir()),
    undefined,
    { id: subSessionId },
  );
  const createRuntime = makeCreateRuntime(modelResult.modelId, { includeSubagentExtension: false });

  const stop = log.startTimer("subagent.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: cwdResult.cwd,
    agentDir: getCodingAgentDir(),
    sessionManager,
  });
  stop();

  const entry = {
    sessionId: subSessionId,
    project: parent.project,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    runtime,
    eventLog: new SessionEventLog(),
  };
  sessionRegistry.set(subSessionId, entry as any);

  const runId = crypto.randomUUID();
  const stopCollector = startSubagentCollector(entry as any, runId);
  const onAbort = () => {
    void runtime.session.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  log.info("subagent.dispatch", {
    subSessionId,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    cwd: cwdResult.cwd,
    modelId: modelResult.modelId,
  });

  const makeDetails = (): SubagentDetails => ({
    subSessionId,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    description: params.description,
  });

  try {
    await runtime.session.prompt(params.task);
    const text = lastAssistantText(runtime.session.messages);
    return {
      content: [{ type: "text", text: signal?.aborted ? `[aborted] ${text}` : text || "(subagent produced no text output)" }],
      details: makeDetails(),
    };
  } catch (err) {
    log.error("subagent.failed", { subSessionId, error: String(err) });
    return {
      content: [{ type: "text", text: `Subagent failed: ${String(err)}` }],
      details: makeDetails(),
      isError: true,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stopCollector();
  }
}


