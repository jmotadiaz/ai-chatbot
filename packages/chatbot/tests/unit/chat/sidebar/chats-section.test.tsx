/**
 * Social unit tests for the sidebar "Chats" section (navigation rework).
 *
 * Renders the REAL `ChatsSection` and `ChatList` with the routing/link
 * boundaries (and the item renderer) substituted. The guarantees under test are
 * the ones the design fixed:
 *
 * - the section header renders even with no chats, so the two global new-chat
 *   actions never disappear;
 * - the actions are global and live only in the root section, never in the
 *   project-nested `ChatList`;
 * - the search shortcut is gone: "/chat/history" is reached through "See all".
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Chat } from "@/lib/features/chat/types";

vi.mock("@/components/chat/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/chat/new", () => ({
  NewChatLink: ({
    label,
    title,
    children,
  }: {
    label?: string;
    title?: string;
    children: React.ReactNode;
  }) => (
    <a href="#" aria-label={label} title={title}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/layout/sidebar/chat-list-item", () => ({
  ChatListItem: ({ title }: { title?: string | null }) => (
    <div role="listitem">{title}</div>
  ),
}));

const { ChatList, ChatsSection } = await import(
  "@/components/layout/sidebar/chat-list"
);

const chatAt = (title: string, index: number): Chat =>
  ({ id: `chat-${index}`, title }) as Chat;

const chats = ["First", "Second", "Third"].map(chatAt);

afterEach(() => {
  cleanup();
});

describe("ChatsSection", () => {
  it("renders the global new-chat actions even when there are no chats", () => {
    render(<ChatsSection chats={[]} />);

    // The solid action is the section label itself.
    expect(screen.getByRole("link", { name: "Chats" })).toBeTruthy();
    expect(screen.getByLabelText("New temporary chat")).toBeTruthy();
    expect(screen.getByText("No chats yet")).toBeTruthy();
  });

  it("hides 'See all' and the history shortcut state when the list is empty", () => {
    render(<ChatsSection chats={[]} />);

    expect(screen.queryByText("See all")).toBeNull();
  });

  it("links to the full history through 'See all' instead of a search icon", () => {
    render(<ChatsSection chats={chats} />);

    const seeAll = screen.getByText("See all").closest("a");
    expect(seeAll?.getAttribute("href")).toBe("/chat/history");
    expect(screen.queryByLabelText("Open chat history")).toBeNull();
    expect(screen.queryByLabelText("New chat")).toBeNull();
    expect(screen.queryByText("No chats yet")).toBeNull();
  });

  it("renders the chats it receives", () => {
    render(<ChatsSection chats={chats} />);

    for (const chat of chats) {
      expect(screen.getByText(chat.title!)).toBeTruthy();
    }
  });
});

describe("ChatList (project-nested)", () => {
  it("renders only the chats: no header, no new-chat actions, no history link", () => {
    render(<ChatList chats={chats} />);

    expect(screen.getByRole("list", { name: "Chat history" })).toBeTruthy();
    expect(screen.queryByText("Chats")).toBeNull();
    expect(screen.queryByRole("link", { name: "Chats" })).toBeNull();
    expect(screen.queryByLabelText("New temporary chat")).toBeNull();
    expect(screen.queryByText("See all")).toBeNull();
  });
});
