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
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const events = [
          { type: "agent_start" },
          { type: "message_start", messageId: "msg-1" },
          {
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "Hello from stub" },
          },
          { type: "message_end", messageId: "msg-1" },
          { type: "agent_end" },
        ];
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

  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id: 1 },
    { status: 404 },
  );
}
