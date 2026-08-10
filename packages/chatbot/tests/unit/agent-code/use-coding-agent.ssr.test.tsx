import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import type { Message } from "@ag-ui/client";
import {
  useCodingAgent,
  type SessionSnapshot,
} from "@/lib/features/code/hooks/use-coding-agent";

function Harness({
  initialSnapshot,
}: {
  initialSnapshot?: SessionSnapshot | null;
}) {
  const { messages, isLoading, isRunning } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
    initialSnapshot,
  });
  return (
    <div>
      <p data-testid="is-loading">{String(isLoading)}</p>
      <p data-testid="is-running">{String(isRunning)}</p>
      {messages.map((m) => (
        <p key={m.id} data-testid={`msg-${m.role}`}>
          {String(m.content)}
        </p>
      ))}
    </div>
  );
}

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    messages: [
      { id: "u1", role: "user", content: "Hello from SSR" } as Message,
    ],
    cursor: { epoch: "e1", seq: 7 },
    running: false,
    ...overrides,
  };
}

describe("useCodingAgent SSR", () => {
  it("renders the seeded conversation during server rendering", () => {
    const html = renderToString(<Harness initialSnapshot={snapshot()} />);
    expect(html).toContain("Hello from SSR");
  });

  it("is not loading on the server when seeded", () => {
    const html = renderToString(<Harness initialSnapshot={snapshot()} />);
    expect(html).toContain('data-testid="is-loading">false<');
  });

  it("carries the seeded running state into the server render", () => {
    const html = renderToString(
      <Harness initialSnapshot={snapshot({ running: true })} />,
    );
    expect(html).toContain('data-testid="is-running">true<');
  });

  // Without a seed the hook has nothing to show until its own fetch resolves,
  // which cannot happen on the server — so the server render stays empty and
  // hydration matches the client's first, still-loading render.
  it("renders no conversation state when there is no seed", () => {
    const html = renderToString(<Harness />);
    expect(html).not.toContain("Hello from SSR");
    expect(html).toContain('data-testid="is-loading">true<');
  });
});
