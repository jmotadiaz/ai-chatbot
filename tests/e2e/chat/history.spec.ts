import { test, expect } from "../fixtures";
import { ChatPage } from "./page";
import { HistoryComponent } from "./history.component";

test.describe("Chat History", () => {
  test("should navigate to history page from sidebar", async ({ page, db }) => {
    // Create some chats to ensure sidebar chat list is visible
    const chats = Array.from({ length: 5 }).map((_, i) => ({
      title: `Chat Title ${i}`,
      messages: [{ role: "user" as const, content: "Hello" }],
    }));
    await db.addChats(chats);

    const chatPage = new ChatPage(page);
    await chatPage.goto();

    // Open sidebar
    await chatPage.header.toggleSidebar();

    // Wait for sidebar chat list to load and click "See all"
    await expect(page.getByText("See all")).toBeVisible();
    await page.getByText("See all").click();

    await page.waitForURL("/chat/history");

    const history = new HistoryComponent(page.locator("body"));
    await expect(history.pageTitle).toBeVisible();
  });

  test("should list chats, filter and delete", async ({ page, db }) => {
    const targetTitle = "Special Unique Chat Title";
    const otherTitle = "Another Chat Title";
    const chats = [
      {
        title: targetTitle,
        messages: [{ role: "user" as const, content: "Hello" }],
      },
      {
        title: otherTitle,
        messages: [{ role: "user" as const, content: "Hello" }],
      },
    ];
    await db.addChats(chats);

    await page.goto("/chat/history");
    const history = new HistoryComponent(page.locator("body"));

    // Wait for page to load
    await expect(history.pageTitle).toBeVisible();

    await history.assertChatVisible(targetTitle);
    await history.assertChatVisible(otherTitle);

    // Filter
    await history.filter("Special Unique");

    // Wait for debounce and verify filter works
    await history.assertChatVisible(targetTitle);
    await history.assertChatHidden(otherTitle);

    // Clear filter
    await history.clearFilter();
    await history.assertChatVisible(otherTitle);

    // Delete
    await history.deleteChat(targetTitle);

    await history.assertChatHidden(targetTitle);
    await history.assertChatVisible(otherTitle);
  });

  test("should support infinite scroll", async ({ page, db }) => {
    // Create 25 chats
    const chats = Array.from({ length: 25 }).map((_, i) => ({
      title: `History Chat ${i}`,
      messages: [{ role: "user" as const, content: "Hello" }],
    }));
    await db.addChats(chats);

    await page.goto("/chat/history");
    const history = new HistoryComponent(page.locator("body"));

    // Wait for page to load
    await expect(history.pageTitle).toBeVisible();
    await expect(history.historyList).toBeVisible();

    // Scroll to bottom
    await history.scrollToBottom();

    // Wait for more items to load (initial: 20, after scroll: 25)
    await history.assertItemCountGreaterThan(20);
  });
});
