import { test, expect } from "../fixtures";
import { ChatPage } from "./page";
import { HistoryPage } from "./history-page";

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

    const historyPage = new HistoryPage(page);
    await expect(historyPage.pageTitle).toBeVisible();
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

    const historyPage = new HistoryPage(page);
    await historyPage.goto();

    // Wait for page to load
    await expect(historyPage.pageTitle).toBeVisible();

    await historyPage.assertChatVisible(targetTitle);
    await historyPage.assertChatVisible(otherTitle);

    // Filter
    await historyPage.filter("Special Unique");

    // Wait for debounce and verify filter works
    await historyPage.assertChatVisible(targetTitle);
    await historyPage.assertChatHidden(otherTitle);

    // Clear filter
    await historyPage.clearFilter();
    await historyPage.assertChatVisible(otherTitle);

    // Delete
    await historyPage.deleteChat(targetTitle);
    // Confirm delete
    await historyPage.confirmModal.confirm();

    await historyPage.assertChatHidden(targetTitle);
    await historyPage.assertChatVisible(otherTitle);
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

    const historyPage = new HistoryPage(page);
    await historyPage.goto();

    // Wait for page to load
    await expect(historyPage.pageTitle).toBeVisible();
    await expect(historyPage.historyList).toBeVisible();

    // Scroll to bottom
    await historyPage.scrollToBottom();

    // Wait for more items to load (initial: 20, after scroll: 25)
    // We expect the count to increase.
    await historyPage.assertItemCountGreaterThan(20);
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

    const historyPage = new HistoryPage(page);
    await historyPage.goto();
    await expect(historyPage.pageTitle).toBeVisible();

    // Verify order: Newer Unpinned first, then Older Pinned
    const items = await historyPage.historyList.getByRole("listitem").allTextContents();

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

    const historyPage = new HistoryPage(page);
    await historyPage.goto();
    await expect(historyPage.pageTitle).toBeVisible();

    // Initial Order: Newer, Older
    let items = await historyPage.historyList.getByRole("listitem").allTextContents();
    let newerIndex = items.findIndex((t) => t.includes("Newer Chat Reference"));
    let olderIndex = items.findIndex((t) => t.includes("Older Chat For Pinning"));

    expect(newerIndex).toBeLessThan(olderIndex);

    // Pin the Older Chat
    await historyPage.togglePinChat("Older Chat For Pinning");

    // Verify client-side state immediately (no reload)
    // Order should NOT change.
    items = await historyPage.historyList.getByRole("listitem").allTextContents();
    newerIndex = items.findIndex((t) => t.includes("Newer Chat Reference"));
    olderIndex = items.findIndex((t) => t.includes("Older Chat For Pinning"));
    expect(newerIndex).toBeLessThan(olderIndex);

    // Wait for network idle or just reload to be sure we are checking server state
    await expect(
      historyPage.getPinButton("Older Chat For Pinning")
    ).toHaveAttribute("aria-label", /unpin chat/i);
    await page.reload();
    await expect(historyPage.pageTitle).toBeVisible();

    items = await historyPage.historyList
      .getByRole("listitem")
      .allTextContents();
    newerIndex = items.findIndex((t) => t.includes("Newer Chat Reference"));
    olderIndex = items.findIndex((t) => t.includes("Older Chat For Pinning"));

    expect(newerIndex).toBeLessThan(olderIndex);
  });
});
