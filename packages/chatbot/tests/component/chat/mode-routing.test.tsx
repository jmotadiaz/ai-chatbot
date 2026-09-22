/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatModeSelector } from "@/components/chat/controls/chat-mode-selector";
import { Message } from "@/components/chat/message";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { OPENROUTER_CHAT_MODE_ROUTING_MODEL } from "@/lib/features/chat/mode-routing/openrouter";
import type { ChatModeRoutingMetadata } from "@/lib/features/chat/mode-routing/types";

const assistantMessage = (
  chatModeRouting: ChatModeRoutingMetadata,
): ChatbotMessage => ({
  id: "assistant-message",
  role: "assistant",
  parts: [],
  metadata: { status: "finished", chatModeRouting },
});

afterEach(cleanup);

describe("ChatModeSelector", () => {
  it("shows Auto first and keeps ctx7, rag and web selectable", () => {
    const onValueChange = vi.fn();
    render(<ChatModeSelector value="auto" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button"));

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Auto"),
      expect.stringContaining("Ctx7"),
      expect.stringContaining("RAG"),
      expect.stringContaining("Web"),
    ]);
  });

  it("renders Auto as the current value for new chats", () => {
    render(<ChatModeSelector value="auto" onValueChange={vi.fn()} />);

    expect(screen.getByRole("button").textContent).toContain("Auto");
  });
});

describe("Chat mode routing badge", () => {
  it("shows a Mode Auto Details trigger; resolved mode and confidence live in the details", () => {
    render(
      <Message
        message={assistantMessage({
          requested: "auto",
          mode: "web",
          reason: "routed",
          confidence: 0.98,
          modelId: OPENROUTER_CHAT_MODE_ROUTING_MODEL,
        })}
      />,
    );

    expect(screen.getByText("Mode Auto Details")).toBeDefined();
    expect(screen.queryByText(/Auto →/)).toBeNull();
    expect(screen.getByText("Mode:")).toBeDefined();
    expect(screen.getByText("Confidence:")).toBeDefined();
    expect(screen.queryByText("Reason:")).toBeNull();
    expect(screen.queryByText("Model:")).toBeNull();
  });

  it("shows a neutral resolution without confidence", () => {
    render(
      <Message
        message={assistantMessage({
          requested: "auto",
          mode: "neutral",
          reason: "neither",
          modelId: OPENROUTER_CHAT_MODE_ROUTING_MODEL,
        })}
      />,
    );

    expect(screen.getByText("Mode Auto Details")).toBeDefined();
    expect(screen.getByText("Mode:")).toBeDefined();
  });

  it("still renders a legacy low_confidence fallback without threshold", () => {
    render(
      <Message
        message={assistantMessage({
          requested: "auto",
          mode: "neutral",
          reason: "low_confidence",
          confidence: 0.42,
          modelId: OPENROUTER_CHAT_MODE_ROUTING_MODEL,
        })}
      />,
    );

    expect(screen.getByText("Mode Auto Details")).toBeDefined();
    expect(screen.getByText("Confidence:")).toBeDefined();
  });

  it("does not render the badge for explicit chat modes", () => {
    render(
      <Message
        message={{
          id: "assistant-message",
          role: "assistant",
          parts: [],
          metadata: { status: "finished" },
        }}
      />,
    );

    expect(screen.queryByText("Mode Auto Details")).toBeNull();
  });
});
