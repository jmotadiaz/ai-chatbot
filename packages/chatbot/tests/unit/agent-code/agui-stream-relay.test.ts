import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import {
  CODING_AGENT_CURSOR_EVENT,
  relayLoggedAguiNdjsonToSse,
} from "@/lib/features/code/agui-stream-relay";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("relayLoggedAguiNdjsonToSse", () => {
  it("emits text chunks and cursor events in order", async () => {
    const workerStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let seq = 1; seq <= 4; seq += 1) {
          controller.enqueue(encoder.encode(`${JSON.stringify({
            epoch: "epoch-1",
            seq,
            event: {
              type: EventType.TEXT_MESSAGE_CHUNK,
              messageId: "message-1",
              delta: String(seq),
            },
          })}\n`));
        }
        controller.close();
      },
    });

    const output: Uint8Array[] = [];
    const summary = await relayLoggedAguiNdjsonToSse({
      workerStream,
      controller: {
        enqueue(value: Uint8Array) {
          output.push(value);
        },
      } as unknown as ReadableStreamDefaultController<Uint8Array>,
      encoder,
      log: { debug() {}, warn() {} },
    });

    const events = decoder
      .decode(Buffer.concat(output))
      .split("\n\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^data: /, "")) as BaseEvent);

    expect(summary.emittedAguiEventCount).toBe(4);
    expect(summary.terminalSeen).toBe(false);
    expect(events.filter((event) => event.type === EventType.TEXT_MESSAGE_CHUNK))
      .toHaveLength(4);
    expect(events.filter((event) => event.type === EventType.CUSTOM))
      .toEqual([
        expect.objectContaining({ name: CODING_AGENT_CURSOR_EVENT, value: { seq: 1, epoch: "epoch-1" } }),
        expect.objectContaining({ name: CODING_AGENT_CURSOR_EVENT, value: { seq: 2, epoch: "epoch-1" } }),
        expect.objectContaining({ name: CODING_AGENT_CURSOR_EVENT, value: { seq: 3, epoch: "epoch-1" } }),
        expect.objectContaining({ name: CODING_AGENT_CURSOR_EVENT, value: { seq: 4, epoch: "epoch-1" } }),
      ]);
  });

  it("suppresses cursors between a terminal event and the next RUN_STARTED so the AG-UI run state machine stays valid (regression: 'Cannot send event type CUSTOM: The run has already finished')", async () => {
    // Minimal repro of the poisoned replay window observed in session
    // 55abf910: RUN_FINISHED(51) → RUN_ERROR(52) → RUN_STARTED(53) → chunks.
    const lines = [
      { epoch: "epoch-1", seq: 51, event: { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" } },
      { epoch: "epoch-1", seq: 52, event: { type: EventType.RUN_ERROR, threadId: "t", runId: "r", message: "boom" } },
      { epoch: "epoch-1", seq: 53, event: { type: EventType.RUN_STARTED, threadId: "t", runId: "r" } },
      { epoch: "epoch-1", seq: 54, event: { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m", delta: "x" } },
    ];
    const workerStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        }
        controller.close();
      },
    });

    const output: Uint8Array[] = [];
    const summary = await relayLoggedAguiNdjsonToSse({
      workerStream,
      controller: {
        enqueue(value: Uint8Array) {
          output.push(value);
        },
      } as unknown as ReadableStreamDefaultController<Uint8Array>,
      encoder,
      log: { debug() {}, warn() {} },
    });

    const events = decoder
      .decode(Buffer.concat(output))
      .split("\n\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^data: /, "")) as BaseEvent);

    // No CUSTOM cursor may appear after RUN_FINISHED and before the next
    // RUN_STARTED; the duplicate terminal's seq is recovered by the cursor
    // that follows RUN_STARTED (53 > 52, no replay gap).
    expect(events.map((e) => (e.type === EventType.CUSTOM ? `CUSTOM:${(e as { value?: { seq?: number } }).value?.seq}` : e.type)))
      .toEqual([
        `CUSTOM:51`,
        EventType.RUN_FINISHED,
        EventType.RUN_STARTED,
        `CUSTOM:53`,
        EventType.TEXT_MESSAGE_CHUNK,
        `CUSTOM:54`,
      ]);
    expect(summary.terminalSeen).toBe(true);
    expect(summary.lastSeq).toBe(54);
  });

  it("drops duplicate terminal events after the first one, keeping the stream alive", async () => {
    const lines = [
      { epoch: "epoch-1", seq: 1, event: { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" } },
      { epoch: "epoch-1", seq: 2, event: { type: EventType.RUN_ERROR, threadId: "t", runId: "r", message: "late" } },
      { epoch: "epoch-1", seq: 3, event: { type: EventType.TOOL_CALL_START, toolCallId: "x", toolCallName: "bash" } },
    ];
    const workerStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        }
        controller.close();
      },
    });

    const warnings: Array<{ message: string; payload?: Record<string, unknown> }> = [];
    const output: Uint8Array[] = [];
    const summary = await relayLoggedAguiNdjsonToSse({
      workerStream,
      controller: {
        enqueue(value: Uint8Array) {
          output.push(value);
        },
      } as unknown as ReadableStreamDefaultController<Uint8Array>,
      encoder,
      log: {
        debug() {},
        warn(message: string, payload?: Record<string, unknown>) {
          warnings.push({ message, payload });
        },
      },
    });

    const events = decoder
      .decode(Buffer.concat(output))
      .split("\n\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^data: /, "")) as BaseEvent);

    // Only the first terminal survives (AG-UI forbids any event after
    // RUN_ERROR, and non-RUN_STARTED events after RUN_FINISHED); the client
    // resyncs from a snapshot/replay on its next reconnect.
    expect(events.map((e) => e.type)).toEqual([
      EventType.CUSTOM,
      EventType.RUN_FINISHED,
    ]);
    expect(warnings.map((w) => w.message)).toEqual([
      "stream.duplicate_terminal_dropped",
      "stream.event_after_terminal_dropped",
    ]);
    expect(summary.emittedAguiEventCount).toBe(1);
  });
});
