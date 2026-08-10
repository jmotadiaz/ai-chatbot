import { describe, it, expect } from "vitest";
import { HttpAgent, EventType } from "@ag-ui/client";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

const server = setupMswServer();

describe("HttpAgent reasoning → text messageId collision (regression)", () => {
  it("keeps reasoning and text in separate messages when chunks use distinct messageIds", async () => {
    // The translator emits REASONING_MESSAGE_CHUNK with a messageId distinct
    // from TEXT_MESSAGE_CHUNK (e.g. `${currentMessageId}-reason`). The AG-UI
    // client's state machine must produce two separate messages: one with
    // role "reasoning" and one with role "assistant".
    const sseBody = [
      sseEvent(EventType.RUN_STARTED, { threadId: "t1", runId: "r1" }),
      sseEvent(EventType.REASONING_MESSAGE_CHUNK, {
        messageId: "msg-1-reason",
        delta: "thinking...",
      }),
      sseEvent(EventType.REASONING_MESSAGE_CHUNK, {
        messageId: "msg-1-reason",
        delta: " still thinking",
      }),
      sseEvent(EventType.TEXT_MESSAGE_CHUNK, {
        messageId: "msg-1",
        delta: "final answer",
      }),
      sseEvent(EventType.RUN_FINISHED, { threadId: "t1", runId: "r1" }),
    ].join("");

    server.use(
      http.post("http://agent.test/sse", () =>
        new HttpResponse(sseBody, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const agent = new HttpAgent({
      url: "http://agent.test/sse",
      threadId: "t1",
    });

    await agent.runAgent({ runId: "r1" });

    const reasoningMsgs = agent.messages.filter((m) => m.role === "reasoning");
    const assistantMsgs = agent.messages.filter((m) => m.role === "assistant");

    expect(reasoningMsgs).toHaveLength(1);
    expect(assistantMsgs).toHaveLength(1);
    expect(reasoningMsgs[0]!.content).toBe("thinking... still thinking");
    expect(assistantMsgs[0]!.content).toBe("final answer");
  });
});
