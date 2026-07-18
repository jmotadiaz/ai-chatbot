import { randomUUID } from "crypto";
import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";
import { HistoryPage } from "./pages/history";

test.describe("Chat History", () => {
  test.describe("Navigation", () => {
    test("should navigate to history page from sidebar", async ({
      page,
      db,
    }) => {
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
  });

  test.describe("Chat List", () => {
    test("should display chats correctly", async ({ page, db }) => {
      const chats = [
        {
          title: "Test Chat 1",
          messages: [{ role: "user" as const, content: "Hello" }],
        },
        {
          title: "Test Chat 2",
          messages: [{ role: "user" as const, content: "Hello" }],
        },
      ];
      await db.addChats(chats);

      const historyPage = new HistoryPage(page);
      await historyPage.goto();

      await expect(historyPage.pageTitle).toBeVisible();
      await historyPage.assertChatVisible("Test Chat 1");
      await historyPage.assertChatVisible("Test Chat 2");
    });

    test("should filter chats by title", async ({ page, db }) => {
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

      // Filter
      await historyPage.filter("Special Unique");

      // Verify filter works
      await historyPage.assertChatVisible(targetTitle);
      await historyPage.assertChatHidden(otherTitle);

      // Clear filter
      await historyPage.clearFilter();
      await historyPage.assertChatVisible(otherTitle);
    });

    test("should support infinite scroll", async ({ page, db }) => {
      // Create 25 chats
      const chats = Array.from({ length: 25 }).map((_, i) => ({
        title: `History Chat ${i}`,
        messages: [{ role: "user" as const, content: "Hello" }],
      }));
      await db.addChats(chats);

      const historyPage = new HistoryPage(page);
      await historyPage.goto();

      await expect(historyPage.pageTitle).toBeVisible();
      await expect(historyPage.historyList).toBeVisible();

      // Scroll to bottom
      await historyPage.scrollToBottom();

      // Wait for more items to load (initial: 20, after scroll: 25)
      await historyPage.assertItemCountGreaterThan(20);
    });
  });

  test.describe("Chat Actions", () => {
    test.describe("Delete", () => {
      test("should show confirmation modal and allow canceling deletion", async ({
        page,
        db,
      }) => {
        const chatTitle = "Chat To Delete";
        const chats = [
          {
            title: chatTitle,
            messages: [{ role: "user" as const, content: "Hello" }],
          },
        ];
        await db.addChats(chats);

        const historyPage = new HistoryPage(page);
        await historyPage.goto();
        await historyPage.assertChatVisible(chatTitle);

        // Trigger Delete
        await historyPage.deleteChat(chatTitle);

        // Verify Modal
        await historyPage.confirmModal.isVisible();
        await historyPage.confirmModal.hasMessage(
          `Are you sure you want to delete the chat "${chatTitle}"?`
        );

        // Cancel
        await historyPage.confirmModal.cancel();
        await historyPage.confirmModal.isHidden();
        await historyPage.assertChatVisible(chatTitle);
      });

      test("should delete a chat after confirmation", async ({ page, db }) => {
        const chatTitle = "Chat To Be Removed";
        const chats = [
          {
            title: chatTitle,
            messages: [{ role: "user" as const, content: "Hello" }],
          },
        ];
        await db.addChats(chats);

        const historyPage = new HistoryPage(page);
        await historyPage.goto();

        await historyPage.deleteChat(chatTitle);
        await historyPage.confirmModal.confirm();

        await historyPage.confirmModal.isHidden();
        await historyPage.assertChatHidden(chatTitle);
      });
    });

    test.describe("Pinning", () => {
      test("should NOT sort pinned chats to top on History page (chronological order)", async ({
        page,
        db,
      }) => {
        // Use unique titles to avoid collisions with worker-shared user
        const olderPinnedTitle = `Older Pinned Chat ${randomUUID().slice(
          0,
          8
        )}`;
        const newerUnpinnedTitle = `Newer Unpinned Chat ${randomUUID().slice(
          0,
          8
        )}`;

        const olderPinnedChat = {
          title: olderPinnedTitle,
          pinned: true,
          updatedAt: new Date(Date.now() - 60000), // 1 minute ago (older)
          messages: [{ role: "user" as const, content: "Hello" }],
        };
        const newerUnpinnedChat = {
          title: newerUnpinnedTitle,
          pinned: false,
          updatedAt: new Date(Date.now()), // Now (newer)
          messages: [{ role: "user" as const, content: "Hi" }],
        };

        await db.addChats([olderPinnedChat, newerUnpinnedChat]);

        const historyPage = new HistoryPage(page);
        await historyPage.goto();

        // Wait for both chats to be visible before checking order
        await historyPage.assertChatVisible(newerUnpinnedTitle);
        await historyPage.assertChatVisible(olderPinnedTitle);

        // Verify order: Newer Unpinned first, then Older Pinned
        const items = await historyPage.historyList
          .getByRole("listitem")
          .allTextContents();

        const newerIndex = items.findIndex((t) =>
          t.includes(newerUnpinnedTitle)
        );
        const olderIndex = items.findIndex((t) => t.includes(olderPinnedTitle));

        expect(newerIndex).not.toBe(-1);
        expect(olderIndex).not.toBe(-1);
        expect(newerIndex).toBeLessThan(olderIndex);
      });

      test("should preserve updatedAt and order when pinning a chat", async ({
        page,
        db,
      }) => {
        // Use unique titles to avoid collisions with worker-shared user
        const olderChatTitle = `Older Chat For Pinning ${randomUUID().slice(
          0,
          8
        )}`;
        const newerChatTitle = `Newer Chat Reference ${randomUUID().slice(
          0,
          8
        )}`;

        const olderChat = {
          title: olderChatTitle,
          pinned: false,
          updatedAt: new Date(Date.now() - 60000), // 1 minute ago (older)
          messages: [{ role: "user" as const, content: "Hello" }],
        };
        const newerChat = {
          title: newerChatTitle,
          pinned: false,
          updatedAt: new Date(Date.now()), // Now (newer)
          messages: [{ role: "user" as const, content: "Hi" }],
        };

        await db.addChats([olderChat, newerChat]);

        const historyPage = new HistoryPage(page);
        await historyPage.goto();

        // Wait for both chats to be visible before checking order
        await historyPage.assertChatVisible(newerChatTitle);
        await historyPage.assertChatVisible(olderChatTitle);

        // Initial Order: Newer, Older
        let items = await historyPage.historyList
          .getByRole("listitem")
          .allTextContents();
        let newerIndex = items.findIndex((t) => t.includes(newerChatTitle));
        let olderIndex = items.findIndex((t) => t.includes(olderChatTitle));
        expect(newerIndex).toBeLessThan(olderIndex);

        // Pin the Older Chat
        await historyPage.togglePinChat(olderChatTitle);

        // Verify order should NOT change (stays chronological)
        items = await historyPage.historyList
          .getByRole("listitem")
          .allTextContents();
        newerIndex = items.findIndex((t) => t.includes(newerChatTitle));
        olderIndex = items.findIndex((t) => t.includes(olderChatTitle));
        expect(newerIndex).toBeLessThan(olderIndex);

        // Reload to verify server state
        await page.reload();

        // Wait for list to reload after navigation
        await historyPage.assertChatVisible(newerChatTitle);
        await historyPage.assertChatVisible(olderChatTitle);

        items = await historyPage.historyList
          .getByRole("listitem")
          .allTextContents();
        newerIndex = items.findIndex((t) => t.includes(newerChatTitle));
        olderIndex = items.findIndex((t) => t.includes(olderChatTitle));
        expect(newerIndex).toBeLessThan(olderIndex);
      });

      test("should NOT disable trash button when pinning a chat", async ({
        page,
        db,
      }) => {
        const chatTitle = "Chat For Pinning State Check";
        const chats = [
          {
            title: chatTitle,
            messages: [{ role: "user" as const, content: "Hello" }],
            pinned: false,
          },
        ];
        await db.addChats(chats);

        const historyPage = new HistoryPage(page);
        await historyPage.goto();

        const pinButton = historyPage.getPinButton(chatTitle);
        const deleteButton = historyPage.getDeleteButton(chatTitle);

        // Trigger pin
        await pinButton.click();

        // Check if delete button is disabled (should not be)
        expect(await deleteButton.isDisabled()).toBe(false);

        // Wait for pin state to update
        await expect(
          page.getByRole("button", { name: "Unpin chat" })
        ).toBeVisible();
      });
    });
  });
});
