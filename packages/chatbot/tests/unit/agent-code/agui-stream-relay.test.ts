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
});
