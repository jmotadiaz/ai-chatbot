import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import type { Message } from "@ag-ui/client";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";

function Harness({ initialMessages }: { initialMessages: Message[] }) {
  const { messages } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
    initialMessages,
    isInitiallyRunning: false,
  });
  return (
    <div>
      {messages.map((m) => (
        <p key={m.id} data-testid={`msg-${m.role}`}>
          {String(m.content)}
        </p>
      ))}
    </div>
  );
}

describe("useCodingAgent SSR", () => {
  it("renders initialMessages during server rendering", () => {
    const initial: Message[] = [
      { id: "u1", role: "user", content: "Hello from SSR" } as Message,
    ];
    const html = renderToString(<Harness initialMessages={initial} />);
    expect(html).toContain("Hello from SSR");
  });
});
