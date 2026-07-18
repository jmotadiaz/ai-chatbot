import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";

function Harness() {
  const { messages } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
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
  it("does not render conversation state during server rendering", () => {
    const html = renderToString(<Harness />);
    expect(html).not.toContain("Hello from SSR");
  });
});
