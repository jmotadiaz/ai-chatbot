import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

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
        let events = [];
        if (prompt.includes("list files")) {
          events = [
            { type: "agent_start" },
            { type: "message_start", message: { role: "assistant" } },
            // Tool 1: list files
            {
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_start",
                contentIndex: 0,
                toolCall: { id: "tc-1", name: "bash" },
              },
            },
            {
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_delta",
                contentIndex: 0,
                delta: '{"command":"ls"}',
              },
            },
            {
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_end",
                contentIndex: 0,
              },
            },
            {
              type: "tool_execution_start",
              toolCallId: "tc-1",
              toolName: "bash",
            },
            {
              type: "tool_execution_end",
              toolCallId: "tc-1",
              result: "README.md\nsrc/",
            },
            // Tool 2: read README
            {
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_start",
                contentIndex: 1,
                toolCall: { id: "tc-2", name: "view_file" },
              },
            },
            {
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_delta",
                contentIndex: 1,
                delta: '{"path":"README.md"}',
              },
            },
            {
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_end",
                contentIndex: 1,
              },
            },
            {
              type: "tool_execution_start",
              toolCallId: "tc-2",
              toolName: "view_file",
            },
            {
              type: "tool_execution_end",
              toolCallId: "tc-2",
              result: "# AI Chatbot\nThis is a Next.js app.",
            },
            // Message end
            { type: "message_end", message: { role: "assistant" } },
            { type: "agent_end" },
          ];
        } else {
          events = [
            { type: "agent_start" },
            { type: "message_start", message: { role: "assistant" } },
            {
              type: "message_update",
              assistantMessageEvent: { type: "text_delta", delta: "Hello from stub" },
            },
            { type: "message_end", message: { role: "assistant" } },
            { type: "agent_end" },
          ];
        }
        for (const event of events) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
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
        const messages = [
          { id: "loaded-0", role: "user", content: "Stub user message" },
          { id: "loaded-1", role: "assistant", content: "Stub assistant reply" },
        ];
        const inFlight: Array<{
          contentIndex: number;
          toolCallId: string;
          name: string;
          argsSoFar: string;
          parentMessageId?: string;
        }> = [];
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "snapshot", messages, inFlight, isStreaming: false }) + "\n"),
        );
        controller.enqueue(encoder.encode(JSON.stringify({ type: "agent_start" }) + "\n"));
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "message_start", message: { role: "assistant" } }) + "\n",
          ),
        );
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "message_update",
              assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Reconnected to stub" },
            }) + "\n",
          ),
        );
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "message_end", message: { role: "assistant" } }) + "\n",
          ),
        );
        controller.enqueue(encoder.encode(JSON.stringify({ type: "agent_end" }) + "\n"));
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
