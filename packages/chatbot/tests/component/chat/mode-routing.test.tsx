/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatModeSelector } from "@/components/chat/controls/chat-mode-selector";
import { Message } from "@/components/chat/message";
import type { ChatbotMessage } from "@/lib/features/chat/types";
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
  it("shows the resolved mode and confidence collapsed", () => {
    render(
      <Message
        message={assistantMessage({
          requested: "auto",
          mode: "web",
          reason: "routed",
          confidence: 0.98,
          modelId: "typesafe/jev-1.13",
        })}
      />,
    );

    expect(screen.getByText("Chat Mode: Auto → Web · 0.98")).toBeDefined();
  });

  it("shows a neutral resolution without confidence", () => {
    render(
      <Message
        message={assistantMessage({
          requested: "auto",
          mode: "neutral",
          reason: "neither",
          modelId: "typesafe/jev-1.13",
        })}
      />,
    );

    expect(screen.getByText("Chat Mode: Auto → Neutral")).toBeDefined();
  });

  it.each([
    ["routed", /routed — classifier decision/],
    ["neither", /neither — no tool needed/],
    ["low_confidence", /low_confidence — confidence missing or below the threshold/],
    ["fallback", /fallback — router error or timeout/],
  ] as const)("renders the %s reason", (reason, expected) => {
    render(
      <Message
        message={assistantMessage({
          requested: "auto",
          mode: reason === "routed" ? "web" : "neutral",
          reason,
          confidence: reason === "low_confidence" ? 0.42 : undefined,
          modelId: "typesafe/jev-1.13",
        })}
      />,
    );

    expect(screen.getByText(expected)).toBeDefined();
    expect(screen.getByText(/typesafe\/jev-1\.13/)).toBeDefined();
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

    expect(screen.queryByText(/Chat Mode: Auto/)).toBeNull();
  });
});
