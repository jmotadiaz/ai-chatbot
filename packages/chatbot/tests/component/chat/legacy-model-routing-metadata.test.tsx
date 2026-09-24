/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Message } from "@/components/chat/message";
import type { ChatbotMessage } from "@/lib/features/chat/types";

afterEach(cleanup);

// The Model Router (query classification into category/complexity, then a
// model pick) is gone: `router.ts`, its prompts and every type it produced
// except `ModelRoutingMetadata` were removed. A message persisted before the
// removal can still carry `metadata.autoModel`, though, and it must keep
// decoding and rendering — the same guarantee `mode-routing.test.tsx` locks
// in for the legacy `low_confidence` reason.
describe("Legacy Model Router metadata", () => {
  it("still renders a Router Details section for autoModel persisted before the removal", () => {
    const message: ChatbotMessage = {
      id: "assistant-message",
      role: "assistant",
      parts: [],
      metadata: {
        status: "finished",
        autoModel: {
          category: "technical",
          complexity: "complex",
          model: "Some Legacy Model",
        },
      },
    };

    render(<Message message={message} />);

    expect(screen.getByText("Router Details")).toBeDefined();
  });

  it("does not render the Router Details section without autoModel", () => {
    const message: ChatbotMessage = {
      id: "assistant-message",
      role: "assistant",
      parts: [],
      metadata: { status: "finished" },
    };

    render(<Message message={message} />);

    expect(screen.queryByText("Router Details")).toBeNull();
  });
});
