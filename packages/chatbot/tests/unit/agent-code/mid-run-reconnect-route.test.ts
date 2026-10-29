import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import { setupTestDb } from "../../helpers/db-setup";
import { createSession } from "@/lib/features/code/session-store";
import { user as userTable } from "@/lib/infrastructure/db/schema";
import { POST as connectPost } from "@/app/(chat)/api/agent/code/connect/route";
import { GET as statusGet } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/status/route";

const { USER_ID } = vi.hoisted(() => ({ USER_ID: "00000000-0000-0000-0000-00000000a11c" }));
vi.mock("@/lib/features/auth/with-auth/handler", () => ({
  withAuth:
    (handler: (user: { id: string }, req: Request) => Promise<Response>) =>
    (req: Request) =>
      handler({ id: USER_ID }, req),
}));

const PROJECT = "ai-chatbot";
const EPOCH = "epoch-mid-run";
const RUN: Array<{ seq: number; event: Record<string, unknown> }> = [
  { seq: 1, event: { type: "RUN_STARTED", threadId: "t", runId: "r" } },
  ...[2, 3, 4, 5].map((seq) => ({
    seq,
    event: { type: "TEXT_MESSAGE_CHUNK", messageId: "msg-mid", role: "assistant", delta: `chunk-${seq}` },
  })),
  { seq: 6, event: { type: "RUN_FINISHED", threadId: "t", runId: "r" } },
];
let workerRunning = true;
const connectAfterSeq: number[] = [];

setupMswServer(
  http.post("*/rpc", async ({ request }) => {
    const body = (await request.json()) as {
      id: number;
      method: string;
      params: { afterSeq?: number; sessionId?: string };
    };
    if (body.method === "initializeSession") {
      return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: { sessionId: body.params.sessionId } });
    }
    if (body.method === "getSessionStatus") {
      return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: { running: workerRunning } });
    }
    if (body.method === "connectToSession") {
      const afterSeq = body.params.afterSeq ?? 0;
      connectAfterSeq.push(afterSeq);
      const firstAttachment = afterSeq === 0;
      const encoder = new TextEncoder();
      const pending = RUN.filter(({ seq }) => seq > afterSeq);
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const next = pending.shift();
          if (!next) {
            controller.close();
            return;
          }
          if (firstAttachment && next.seq > 3) {
            controller.error(new Error("connection dropped"));
            return;
          }
          controller.enqueue(
            encoder.encode(JSON.stringify({ epoch: EPOCH, seq: next.seq, event: next.event }) + "\n"),
          );
          if (next.seq === 6) workerRunning = false;
        },
      }, { highWaterMark: 0 });
      return new HttpResponse(stream, { headers: { "Content-Type": "application/x-ndjson" } });
    }
    return HttpResponse.json(
      { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `unexpected ${body.method}` } },
      { status: 500 },
    );
  }),
);

let sessionId = "";
function connectRequest(afterSeq: number) {
  return new Request("http://localhost/api/agent/code/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId: sessionId,
      context: [
        { description: "project", value: PROJECT },
        { description: "sessionId", value: sessionId },
      ],
      forwardedProps: { afterSeq, epoch: EPOCH },
    }),
  });
}
function statusRequest() {
  return new Request(`http://localhost/api/agent/code/sessions/${sessionId}/status`);
}
function deltas(sse: string): string[] {
  return [...sse.matchAll(/"delta":"(chunk-\d+)"/g)].map((m) => m[1]);
}
async function readUntil(res: Response, marker: string): Promise<string> {
  if (!res.body) throw new Error("connect response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(marker)) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  return text;
}

describe("mid-run reconnect through the Coding Agent routes", () => {
  let db: Awaited<ReturnType<typeof setupTestDb>>;
  beforeAll(async () => {
    db = await setupTestDb();
    await db.insert(userTable).values({ id: USER_ID, email: "mid-run@example.com" });
  });
  beforeEach(async () => {
    workerRunning = true;
    connectAfterSeq.length = 0;
    sessionId = (await createSession({ userId: USER_ID, project: PROJECT })).sessionId;
  });
  it("reports running: true to the status route while the run is active", async () => {
    const res = await statusGet(statusRequest());
    expect(res.status).toBe(200);
    expect((await res.json()) as { running: boolean }).toEqual({ running: true });
  });
  it("resumes after a dropped attachment without replaying delivered events", async () => {
    const first = await connectPost(connectRequest(0));
    expect(first.ok).toBe(true);
    const firstSse = await readUntil(first, "chunk-3");
    expect(deltas(firstSse)).toEqual(["chunk-2", "chunk-3"]);
    const midRun = await statusGet(statusRequest());
    expect((await midRun.json()) as { running: boolean }).toEqual({ running: true });
    const second = await connectPost(connectRequest(3));
    expect(second.ok).toBe(true);
    const secondSse = await second.text();
    expect(deltas(secondSse)).toEqual(["chunk-4", "chunk-5"]);
    expect(secondSse).toContain('"type":"RUN_FINISHED"');
    expect(connectAfterSeq).toEqual([0, 3]);
    const finished = await statusGet(statusRequest());
    expect((await finished.json()) as { running: boolean }).toEqual({ running: false });
  });
});
