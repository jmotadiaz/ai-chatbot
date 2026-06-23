import { describe, it, expect } from "vitest";
import {
  AbstractAgent,
  EventType,
  runHttpRequest,
  transformHttpEventStream,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";

function eventStreamFrom(events: BaseEvent[]) {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return transformHttpEventStream(
    runHttpRequest(() =>
      Promise.resolve(
        new Response(body, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    ),
  );
}

class TestAgent extends AbstractAgent {
  private events: BaseEvent[];

  constructor(events: BaseEvent[]) {
    super({ threadId: "t1", initialMessages: [] });
    this.events = events;
  }

  run() {
    return eventStreamFrom([]);
  }

  connect() {
    return eventStreamFrom(this.events);
  }
}

function run(events: BaseEvent[]): Promise<{ messages: Message[]; error?: string }> {
  return new Promise((resolve) => {
    const agent = new TestAgent(events);
    const errors: string[] = [];
    agent
      .connectAgent({ runId: "r1" }, {
        onRunFailed: ({ error }) => {
          errors.push(error.message);
        },
      })
      .then(() => {
        resolve({ messages: agent.messages, error: errors[0] });
      })
      .catch((err) => {
        resolve({ messages: agent.messages, error: String(err) });
      });
  });
}

describe("reconnect repro", () => {
  it("applies MESSAGES_SNAPSHOT and in-flight TOOL_CALL_START without duplicates", async () => {
    const events: BaseEvent[] = [
      {
        type: EventType.RUN_STARTED,
        threadId: "t1",
        runId: "r1",
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          { id: "loaded-0", role: "user", content: "hello" },
          {
            id: "loaded-1",
            role: "assistant",
            content: "",
          },
        ],
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tc-1",
        toolCallName: "bash",
        parentMessageId: "loaded-1",
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tc-1",
        delta: '{"co',
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tc-1",
        delta: 'mmand":"ls"}',
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tc-1",
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-msg-1",
        toolCallId: "tc-1",
        role: "tool",
        content: "file1 file2",
        timestamp: Date.now(),
      } as BaseEvent,
      {
        type: EventType.RUN_FINISHED,
        threadId: "t1",
        runId: "r1",
        timestamp: Date.now(),
      } as BaseEvent,
    ];

    const result = await run(events);
    expect(result.error).toBeUndefined();
    const assistant = result.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant!.toolCalls?.length).toBe(1);
    expect(assistant!.toolCalls?.[0].function.arguments).toBe('{"command":"ls"}');
  });
});
