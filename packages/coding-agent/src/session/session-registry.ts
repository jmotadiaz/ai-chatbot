import path from "node:path";
import { existsSync } from "node:fs";
import { createAgentSessionRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { config } from "config";
import { getTraceLogger } from "tracing";
import type { ThinkingLevel } from "models";
import { SessionEventLog } from "../agui/event-log";
import {
  type SessionEntry,
  assertSessionAccess,
  resolveProjectPath,
} from "./session-entry";
import { loadPrompts } from "../runtime/prompts";
import { getCodingAgentDir, getSessionsDir } from "../runtime/paths";
import { makeCreateRuntime as defaultMakeCreateRuntime } from "../runtime/runtime-factory";

export interface GetOrCreateSessionOptions {
  userId: string;
  project: string;
  sessionId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel; // kept for backwards compat until b1 fully lands; ignored here after b1
}

type MakeCreateRuntime = typeof defaultMakeCreateRuntime;

export class SessionRegistry {
  private sessions = new Map<string, SessionEntry>();
  private makeCreateRuntime: MakeCreateRuntime;

  constructor(makeCreateRuntime: MakeCreateRuntime = defaultMakeCreateRuntime) {
    this.makeCreateRuntime = makeCreateRuntime;
  }

  /** Test seam: override the factory (replaces __seed). */
  setRuntimeFactory(factory: MakeCreateRuntime): void {
    this.makeCreateRuntime = factory;
  }

  get(sessionId: string, parentSessionId?: string): SessionEntry | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    assertSessionAccess(entry, parentSessionId);
    return entry;
  }

  /** Raw get without access check (internal). */
  getRaw(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  entries(): IterableIterator<SessionEntry> {
    return this.sessions.values();
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  set(sessionId: string, entry: SessionEntry): void {
    this.sessions.set(sessionId, entry);
  }

  clear(): void {
    this.sessions.clear();
  }

  async loadSessionFromDisk(
    sessionId: string,
    project: string,
    modelId?: string,
    options?: {
      sessionsSubdir?: string;
      parentSessionId?: string;
      parentToolCallId?: string;
    },
  ): Promise<SessionEntry | undefined> {
    const log = getTraceLogger("worker");
    const sessionsDir = getSessionsDir();
    const projectsRoot = config.codingAgentProjectsRoot();
    const cwd = resolveProjectPath(projectsRoot, project);
    loadPrompts(cwd);
    const listDir = options?.sessionsSubdir
      ? path.join(sessionsDir, options.sessionsSubdir)
      : sessionsDir;

    log.info("session.load_disk_attempt", { sessionId });

    const allSessions = await SessionManager.list(listDir);
    const found = allSessions.find((s) => s.id === sessionId);

    if (!found || !existsSync(found.path)) {
      log.warn("session.load_disk_not_found", { sessionId, sessionsChecked: allSessions.length });
      return undefined;
    }

    log.info("session.load_disk_found", { path: found.path });

    const sessionManager = SessionManager.open(found.path, listDir);
    const createRuntime = this.makeCreateRuntime(modelId, {
      includeSubagentExtension: !options?.parentSessionId,
    });

    const stop = log.startTimer("session.runtime_create");
    const runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir: getCodingAgentDir(),
      sessionManager,
    });
    stop();

    const entry: SessionEntry = {
      sessionId,
      project,
      parentSessionId: options?.parentSessionId,
      parentToolCallId: options?.parentToolCallId,
      runtime,
      eventLog: new SessionEventLog(),
    };
    this.sessions.set(sessionId, entry);
    log.info("session.load_disk_done", { sessionId });
    return entry;
  }

  async resolveSessionEntry(options: GetOrCreateSessionOptions): Promise<SessionEntry> {
    const log = getTraceLogger("worker");

    const existing = options.sessionId ? this.sessions.get(options.sessionId) : undefined;

    if (existing && existing.project === options.project) {
      log.info("session.reuse", { sessionId: existing.sessionId });
      // b1: model/thinking no longer switched here; TurnRunner applies per-turn.
      // Keep seed logic for backwards compat test that expects guard before b1 is removed:
      // if caller still sends modelId with thinkingLevel via initializeSession, we intentionally no-op here.
      return existing;
    }

    if (options.sessionId) {
      const loaded = await this.loadSessionFromDisk(
        options.sessionId,
        options.project,
        options.modelId,
      );
      if (loaded) return loaded;
    }

    const sessionId = options.sessionId ?? crypto.randomUUID();
    const projectsRoot = config.codingAgentProjectsRoot();
    const cwd = resolveProjectPath(projectsRoot, options.project);

    loadPrompts(cwd);

    log.info("session.create", {
      sessionId,
      project: options.project,
      modelId: options.modelId,
    });

    const sessionManager = SessionManager.create(
      getSessionsDir(),
      undefined,
      { id: sessionId },
    );
    const createRuntime = this.makeCreateRuntime(options.modelId);

    const stop = log.startTimer("session.runtime_create");
    const runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir: getCodingAgentDir(),
      sessionManager,
    });
    stop();

    const entry: SessionEntry = {
      sessionId,
      project: options.project,
      runtime,
      eventLog: new SessionEventLog(),
    };
    this.sessions.set(sessionId, entry);
    return entry;
  }

  async getOrCreateSession(options: GetOrCreateSessionOptions): Promise<{ sessionId: string }> {
    const entry = await this.resolveSessionEntry(options);
    // b1: thinkingLevel no longer applied here; TurnRunner will apply per turn.
    return { sessionId: entry.sessionId };
  }

  async disposeSession(sessionId: string): Promise<void> {
    const log = getTraceLogger("worker");
    const entry = this.sessions.get(sessionId);
    if (entry) {
      log.info("session.dispose", { sessionId });
      entry.runtime.session.dispose();
      this.sessions.delete(sessionId);
    } else {
      log.warn("session.dispose_not_found", { sessionId });
    }
    const childIds = [...this.sessions.values()]
      .filter((candidate) => candidate.parentSessionId === sessionId)
      .map((candidate) => candidate.sessionId);
    for (const childId of childIds) {
      const child = this.sessions.get(childId);
      if (!child) continue;
      log.info("session.dispose_child", { sessionId: childId, parentSessionId: sessionId });
      child.runtime.session.dispose();
      this.sessions.delete(childId);
    }
  }
}

// Singleton used by the facade (stable until tests inject their own registry)
export const sessionRegistry = new SessionRegistry();

// Re-export helpers for legacy facade shims
export { assertSessionAccess };
