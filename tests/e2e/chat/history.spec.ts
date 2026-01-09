import { test, expect } from "../fixtures";
import { ChatPage } from "./page";
import { HistoryComponent } from "./history.component";

test.describe("Chat History", () => {
  test("should navigate to history page from sidebar", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();
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

  test("should list chats, filter and delete", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();
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

  test("should support infinite scroll", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();
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

  test("should NOT sort pinned chats to top", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();
    const olderPinnedChat = {
      title: "Older Pinned Chat",
      pinned: true,
      updatedAt: new Date(Date.now() - 1000000), // Older
      messages: [{ role: "user" as const, content: "Hello" }],
    };
    const newerUnpinnedChat = {
      title: "Newer Unpinned Chat",
      pinned: false,
      updatedAt: new Date(Date.now()), // Newer
      messages: [{ role: "user" as const, content: "Hi" }],
    };

    await db.addChats([olderPinnedChat, newerUnpinnedChat]);

    await page.goto("/chat/history");
    const history = new HistoryComponent(page.locator("body"));
    await expect(history.pageTitle).toBeVisible();

    // Verify order: Newer Unpinned first, then Older Pinned
    const items = await history.historyList.getByRole("listitem").allTextContents();

    // Check if at least these two exist and are in correct relative order
    const newerIndex = items.findIndex(t => t.includes("Newer Unpinned Chat"));
    const olderIndex = items.findIndex(t => t.includes("Older Pinned Chat"));

    expect(newerIndex).not.toBe(-1);
    expect(olderIndex).not.toBe(-1);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  test("should preserve updatedAt when pinning a chat", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();

    const olderChat = {
      title: "Older Chat For Pinning",
      pinned: false,
      updatedAt: new Date(Date.now() - 1000000), // Older
      messages: [{ role: "user" as const, content: "Hello" }],
    };
    const newerChat = {
      title: "Newer Chat Reference",
      pinned: false,
      updatedAt: new Date(Date.now()), // Newer
      messages: [{ role: "user" as const, content: "Hi" }],
    };

    await db.addChats([olderChat, newerChat]);

    await page.goto("/chat/history");
    const history = new HistoryComponent(page.locator("body"));
    await expect(history.pageTitle).toBeVisible();

    // Initial Order: Newer, Older
    let items = await history.historyList.getByRole("listitem").allTextContents();
    let newerIndex = items.findIndex((t) => t.includes("Newer Chat Reference"));
    let olderIndex = items.findIndex((t) => t.includes("Older Chat For Pinning"));

    expect(newerIndex).toBeLessThan(olderIndex);

    // Pin the Older Chat
    await history.togglePinChat("Older Chat For Pinning");

    // Wait for network idle or just reload to be sure we are checking server state
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(history.pageTitle).toBeVisible();

    // Verify Order is STILL: Newer, Older
    // If bug existed, Older would have new updatedAt and might jump ahead of Newer (or stay same if we didn't fix sorting, but we did fix sorting in previous step).
    // Wait, in previous step we fixed sorting to IGNORE pinned status.
    // So if updatedAt updates to NOW, then Older becomes Newer!
    // So "Older Chat" would become the NEWEST chat.
    // So if bug exists (updatedAt changes), Older should be FIRST.
    // If fix works (updatedAt preserved), Older should be SECOND.

    items = await history.historyList.getByRole("listitem").allTextContents();
    newerIndex = items.findIndex((t) => t.includes("Newer Chat Reference"));
    olderIndex = items.findIndex((t) => t.includes("Older Chat For Pinning"));

    expect(newerIndex).toBeLessThan(olderIndex);
  });
});
