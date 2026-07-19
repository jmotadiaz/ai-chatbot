import { createRequire } from "node:module";
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";
import { describe, it, expect } from "vitest";

import { isDuplicateToolCallStart } from "@/lib/features/code/hooks/use-coding-agent";

// rxjs is a transitive dependency (via @ag-ui/client); resolve it from there
// so the test drives the exact Observable implementation the client uses.
type RunResult = ReturnType<AbstractAgent["run"]>;
const require = createRequire(import.meta.url);
const aguiRequire = createRequire(require.resolve("@ag-ui/client"));
const { Observable } = aguiRequire("rxjs") as {
  Observable: new (
    init: (subscriber: { next(event: BaseEvent): void; complete(): void }) => void,
  ) => RunResult;
};

class ReplayAgent extends AbstractAgent {
  constructor(
    private readonly events: BaseEvent[],
    initialMessages: Message[],
  ) {
    super({ initialMessages });
  }

  run(): RunResult {
    return new Observable((subscriber) => {
      for (const event of this.events) subscriber.next(event);
      subscriber.complete();
    });
  }
}

// The client state at cut time: the assistant message holds the tool call
// with the args streamed so far.
function messagesAtCut(): Message[] {
  return [
    { id: "u1", role: "user", content: "edit the file" },
    {
      id: "a1",
      role: "assistant",
      toolCalls: [
        { id: "t1", type: "function", function: { name: "write", arguments: '{"path"' } },
      ],
    },
  ] as unknown as Message[];
}

// The worker replay tail after the cursor: args for a tool call whose
// TOOL_CALL_START happened before the cut.
const tail: BaseEvent[] = [
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: ':"a.ts"}' },
  { type: EventType.TOOL_CALL_END, toolCallId: "t1" },
  {
    type: EventType.CUSTOM,
    name: "coding_agent_files_changed",
    value: { files: [{ path: "a.ts", status: "modified" }] },
  },
  { type: EventType.RUN_FINISHED },
] as BaseEvent[];

const runStarted = (runId: string): BaseEvent =>
  ({ type: EventType.RUN_STARTED, threadId: "th1", runId }) as BaseEvent;

const syntheticStart: BaseEvent = {
  type: EventType.TOOL_CALL_START,
  toolCallId: "t1",
  toolCallName: "write",
  parentMessageId: "a1",
} as BaseEvent;

describe("reconnect prelude through the real AG-UI pipeline", () => {
  it("reproduces the production failure without the prelude", async () => {
    const agent = new ReplayAgent([runStarted("r1"), ...tail], messagesAtCut());
    await expect(agent.runAgent({ runId: "r1" })).rejects.toThrow(
      /No active tool call found with ID 't1'/,
    );
  });

  it("delivers the files-changed CUSTOM event when the prelude re-opens the tool call", async () => {
    const agent = new ReplayAgent(
      [runStarted("r1"), syntheticStart, ...tail],
      messagesAtCut(),
    );
    const customEvents: BaseEvent[] = [];
    agent.subscribe({
      onToolCallStartEvent: ({ event, messages }) => {
        if (isDuplicateToolCallStart(messages, event)) {
          return { stopPropagation: true };
        }
        return undefined;
      },
      onCustomEvent: ({ event }) => {
        customEvents.push(event);
      },
    });

    await agent.runAgent({ runId: "r1" });

    expect(customEvents).toHaveLength(1);
    expect((customEvents[0] as { name?: string }).name).toBe(
      "coding_agent_files_changed",
    );

    // The guard must keep a single tool call entry, with the args completed
    // by the replayed tail.
    const assistant = agent.messages.find((m) => m.id === "a1") as {
      toolCalls?: { id: string; function: { arguments: string } }[];
    };
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls?.[0]?.function.arguments).toBe('{"path":"a.ts"}');
  });
});
