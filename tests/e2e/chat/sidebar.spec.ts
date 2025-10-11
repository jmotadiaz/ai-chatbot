import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

const chats = [
  {
    title: "Chat 1",
    messages: [{ role: "user" as const, content: "Hello" }],
  },
  {
    title: "Chat 2",
    messages: [{ role: "user" as const, content: "Hi" }],
  },
];

import type { Chat } from "@/lib/db/schema";

test.describe("Chat Sidebar", () => {
  let createdChats: Chat[];

  test.beforeEach(async ({ db, authenticatedUser }) => {
    createdChats = await db.addChats(chats);
  });

  test("should navigate between chats", async ({ page }) => {
    const chatPage = new ChatPage(page);
    const chat1 = createdChats[0];
    const chat2 = createdChats[1];

    await chatPage.goto(chat1.id);
    await expect(page.getByText("Hello")).toBeVisible();

    await chatPage.clickChatByTitle("Chat 2");
    await expect(page.getByText("Hi")).toBeVisible();
  });

  test("should display the chat list", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();
    const chatTitles = await chatPage.getChatTitles();
    expect(chatTitles).toEqual(["Chat 2", "Chat 1"]);
  });

  test("should toggle the sidebar visibility", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    // Sidebar should be visible by default
    await expect(chatPage.sidebar).toBeVisible();

    // Click to hide
    await chatPage.toggleSidebar();
    await expect(chatPage.sidebar).not.toBeVisible();

    // Click to show again
    await chatPage.toggleSidebar();
    await expect(chatPage.sidebar).toBeVisible();
  });

  test("should delete a chat when the delete button is clicked", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();
    await chatPage.deleteChat("Chat 1");
    const chatTitles = await chatPage.getChatTitles();
    expect(chatTitles).toEqual(["Chat 2"]);
  });
});