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

import type { Chat } from "@/lib/infrastructure/db/schema";

test.describe("Chat Sidebar", () => {
  let createdChats: Chat[];

  test.beforeEach(async ({ db, authenticatedUser }) => {
    createdChats = await db.addChats(chats);
    expect(authenticatedUser).toBeDefined();
  });

  test("should navigate between chats", async ({ page }) => {
    const chatPage = new ChatPage(page);
    const chat1 = createdChats[0];

    await chatPage.goto(chat1.id);
    await expect.soft(page.getByText("Hello")).toBeVisible();

    await chatPage.header.toggleSidebar();
    await chatPage.sidebar.clickChatByTitle("Chat 2");
    await expect.soft(page.getByText("Hi")).toBeVisible();
  });

  test("should display the chat list", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();
    await chatPage.header.toggleSidebar();
    await expect
      .soft(chatPage.sidebar.getChatItemByTitle("Chat 1"))
      .toBeVisible();
    await expect
      .soft(chatPage.sidebar.getChatItemByTitle("Chat 2"))
      .toBeVisible();
  });

  test("should toggle the sidebar visibility", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    await expect.soft(chatPage.sidebar.container).not.toBeVisible();

    await chatPage.header.toggleSidebar();
    await expect.soft(chatPage.sidebar.container).toBeVisible();

    await chatPage.header.toggleSidebar();
    await expect.soft(chatPage.sidebar.container).not.toBeVisible();
  });

  test("should delete a chat when the delete button is clicked", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();
    await chatPage.header.toggleSidebar();
    await chatPage.sidebar.deleteChat("Chat 1");
    await expect
      .soft(chatPage.sidebar.getChatItemByTitle("Chat 1"))
      .not.toBeAttached();
  });
});
