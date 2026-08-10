// @vitest-environment jsdom
import { EventType, type BaseEvent } from "@ag-ui/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  FILES_CHANGED_EVENT,
  filesChangedFromEvent,
  loadTurnFiles,
  persistTurnFiles,
} from "@/lib/features/code/turn-files";

function filesChangedEvent(value: unknown): BaseEvent {
  return {
    type: EventType.CUSTOM,
    name: FILES_CHANGED_EVENT,
    value,
  } as BaseEvent;
}

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("filesChangedFromEvent", () => {
  it("returns null for unrelated events", () => {
    expect(
      filesChangedFromEvent({ type: EventType.RUN_FINISHED } as BaseEvent),
    ).toBeNull();
    expect(
      filesChangedFromEvent({
        type: EventType.CUSTOM,
        name: "coding_agent_cursor",
        value: { seq: 1 },
      } as BaseEvent),
    ).toBeNull();
  });

  it("extracts valid files", () => {
    expect(
      filesChangedFromEvent(
        filesChangedEvent({
          runId: "r1",
          files: [
            { path: "src/a.ts", status: "modified" },
            { path: "new.ts", status: "untracked" },
          ],
        }),
      ),
    ).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "new.ts", status: "untracked" },
    ]);
  });

  it("drops malformed entries and defaults unknown statuses", () => {
    expect(
      filesChangedFromEvent(
        filesChangedEvent({
          files: [
            { path: "../evil.ts", status: "modified" },
            { path: "/abs.ts", status: "modified" },
            { path: 42, status: "modified" },
            null,
            { path: "ok.ts", status: "mystery" },
          ],
        }),
      ),
    ).toEqual([{ path: "ok.ts", status: "modified" }]);
  });

  it("returns null for a malformed payload", () => {
    expect(filesChangedFromEvent(filesChangedEvent(null))).toBeNull();
    expect(filesChangedFromEvent(filesChangedEvent({ files: "x" }))).toBeNull();
  });
});

describe("turn-files persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips through localStorage", () => {
    const map = new Map([
      ["msg-1", [{ path: "a.ts", status: "modified" as const }]],
      ["msg-2", [{ path: "b.ts", status: "added" as const }]],
    ]);
    persistTurnFiles("s1", map);
    expect(loadTurnFiles("s1")).toEqual(map);
  });

  it("is scoped per session", () => {
    persistTurnFiles("s1", new Map([["m", [{ path: "a.ts", status: "modified" as const }]]]));
    expect(loadTurnFiles("other").size).toBe(0);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("coding-agent:turn-files:s1", "{not json");
    expect(loadTurnFiles("s1").size).toBe(0);
  });
});
