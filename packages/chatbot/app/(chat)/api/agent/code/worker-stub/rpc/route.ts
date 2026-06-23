import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const EventType = {
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  TEXT_MESSAGE_CHUNK: "TEXT_MESSAGE_CHUNK",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",
} as const;

export async function POST(req: NextRequest) {
  const { method, params } = await req.json();

  if (method === "getAvailableModels") {
    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        models: [
          {
            providerId: "opencode-go",
            modelId: "deepseek-v4-pro",
            label: "Deepseek v4 Pro",
          },
          {
            providerId: "opencode-go",
            modelId: "kimi-k2.6",
            label: "Kimi K2.6",
          },
        ],
      },
      id: 1,
    });
  }

  if (method === "initializeSession") {
    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        sessionId: params.sessionId ?? "stub-session",
        piSessionId: "stub-pi-session",
      },
      id: 1,
    });
  }

  if (method === "sendPrompt") {
    const prompt = params?.prompt ?? "";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let seq = 1;
        const emit = (event: object) => {
          controller.enqueue(encoder.encode(JSON.stringify({ seq: seq++, event }) + "\n"));
        };

        if (prompt.includes("list files")) {
          emit({ type: EventType.RUN_STARTED, threadId: params.sessionId, runId: params._traceRunId ?? "stub-run" });
          emit({ type: EventType.TOOL_CALL_START, toolCallId: "tc-1", toolCallName: "bash" });
          emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: "tc-1", delta: '{"command":"ls"}' });
          emit({ type: EventType.TOOL_CALL_END, toolCallId: "tc-1" });
          emit({ type: EventType.STEP_STARTED, stepName: "tool:bash:tc-1", rawEvent: { toolCallId: "tc-1" } });
          emit({ type: EventType.TOOL_CALL_RESULT, messageId: "tool-msg-1", toolCallId: "tc-1", role: "tool", content: "README.md\nsrc/" });
          emit({ type: EventType.STEP_FINISHED, stepName: "tool:bash:tc-1", rawEvent: { toolCallId: "tc-1" } });
          emit({ type: EventType.TOOL_CALL_START, toolCallId: "tc-2", toolCallName: "view_file" });
          emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: "tc-2", delta: '{"path":"README.md"}' });
          emit({ type: EventType.TOOL_CALL_END, toolCallId: "tc-2" });
          emit({ type: EventType.STEP_STARTED, stepName: "tool:view_file:tc-2", rawEvent: { toolCallId: "tc-2" } });
          emit({ type: EventType.TOOL_CALL_RESULT, messageId: "tool-msg-2", toolCallId: "tc-2", role: "tool", content: "# AI Chatbot\nThis is a Next.js app." });
          emit({ type: EventType.STEP_FINISHED, stepName: "tool:view_file:tc-2", rawEvent: { toolCallId: "tc-2" } });
          emit({ type: EventType.RUN_FINISHED, threadId: params.sessionId, runId: params._traceRunId ?? "stub-run" });
        } else {
          emit({ type: EventType.RUN_STARTED, threadId: params.sessionId, runId: params._traceRunId ?? "stub-run" });
          emit({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "msg-1", role: "assistant", delta: "Hello from stub" });
          emit({ type: EventType.RUN_FINISHED, threadId: params.sessionId, runId: params._traceRunId ?? "stub-run" });
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  if (method === "connectToSession") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let seq = params.afterSeq ?? 0;
        const emit = (event: object) => {
          seq += 1;
          controller.enqueue(encoder.encode(JSON.stringify({ seq, event }) + "\n"));
        };
        emit({ type: EventType.RUN_STARTED, threadId: params.sessionId, runId: params._traceRunId ?? "stub-run" });
        emit({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "msg-reconnect", role: "assistant", delta: "Reconnected to stub" });
        emit({ type: EventType.RUN_FINISHED, threadId: params.sessionId, runId: params._traceRunId ?? "stub-run" });
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  if (method === "cancelRun") {
    return NextResponse.json({
      jsonrpc: "2.0",
      result: { cancelled: true },
      id: 1,
    });
  }

  if (method === "getSessionStatus") {
    return NextResponse.json({
      jsonrpc: "2.0",
      result: { running: false },
      id: 1,
    });
  }

  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id: 1 },
    { status: 404 },
  );
}
