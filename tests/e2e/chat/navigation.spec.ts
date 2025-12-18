import { test, expect } from "../fixtures";
import { ChatPage } from "./page";
import type { Chat } from "@/lib/infrastructure/db/schema";

// Generate a chat with many messages to enable scrolling
const generateLongChat = () => {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (let i = 1; i <= 10; i++) {
    messages.push({
      role: "user",
      content: `User message ${i}: ${"Lorem ipsum dolor sit amet. ".repeat(5)}`,
    });
    messages.push({
      role: "assistant",
      content: `Assistant response ${i}: ${"This is a detailed response to help test scrolling. ".repeat(10)}`,
    });
  }

  return messages;
};

const chatWithManyMessages = {
  title: "Long Chat",
  messages: generateLongChat(),
};

const chatWithSingleMessage = {
  title: "Single Message Chat",
  messages: [
    { role: "user" as const, content: "Hello" },
    { role: "assistant" as const, content: "Hi there!" },
  ],
};

test.describe("Chat Navigation", () => {
  let longChat: Chat;
  let singleMessageChat: Chat;

  test.beforeEach(async ({ db, authenticatedUser }) => {
    const chats = await db.addChats([
      chatWithManyMessages,
      chatWithSingleMessage,
    ]);
    longChat = chats[0];
    singleMessageChat = chats[1];
    expect(authenticatedUser).toBeDefined();
  });

  test.describe("Initial scroll position", () => {
    test("should scroll to last user message when loading existing chat", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();

      // Wait for the initial scroll to complete
      await page.waitForTimeout(800);

      // The last user message should be visible
      const isLastVisible =
        await chatPage.chat.navigation.isUserMessageInViewport(9);
      expect.soft(isLastVisible).toBe(true);

      // The first user message should NOT be visible (scrolled past)
      const isFirstVisible =
        await chatPage.chat.navigation.isUserMessageInViewport(0);
      expect.soft(isFirstVisible).toBe(false);
    });
  });

  test.describe("Previous button", () => {
    test("should not show prev button when first user message is visible", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to top to make first message visible
      await chatPage.chat.navigation.scrollToTop();

      // Wait for prev button to disappear (if it was visible)
      await expect(chatPage.chat.navigation.prevButton).not.toBeVisible({
        timeout: 2000,
      });
    });

    test("should show prev button when first user message leaves viewport", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Get position of second message and scroll there
      const secondMessagePos =
        await chatPage.chat.navigation.getUserMessageScrollPosition(1);
      await chatPage.chat.navigation.scrollToPosition(secondMessagePos + 100);

      // Wait for prev button to appear
      await expect.soft(chatPage.chat.navigation.prevButton).toBeVisible({
        timeout: 2000,
      });
    });

    test("should navigate to previous user message when clicking prev", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to message 5 position
      const message5Pos =
        await chatPage.chat.navigation.getUserMessageScrollPosition(5);
      await chatPage.chat.navigation.scrollToPosition(message5Pos);
      await page.waitForTimeout(500);

      // Wait for prev button to be visible
      await expect(chatPage.chat.navigation.prevButton).toBeVisible({
        timeout: 2000,
      });

      // Click prev button
      await chatPage.chat.navigation.clickPrev();

      // Wait for smooth scroll animation to complete
      await page.waitForTimeout(800);

      // After clicking prev from position of message 5, we should scroll to a previous message
      // The scroll position should be less than where we started
      const newScrollTop = await chatPage.chat.navigation.getScrollTop();
      expect.soft(newScrollTop).toBeLessThan(message5Pos);
    });
  });

  test.describe("Next button", () => {
    test("should not show next button when only one user message exists", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(singleMessageChat.id);

      // Wait for message to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Next button should not be visible (only 1 user message)
      await expect
        .soft(chatPage.chat.navigation.nextButton)
        .not.toBeVisible();
    });

    test("should show next button when last user message is below viewport", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to top
      await chatPage.chat.navigation.scrollToTop();

      // Wait for next button to appear
      await expect.soft(chatPage.chat.navigation.nextButton).toBeVisible({
        timeout: 2000,
      });
    });

    test("should not show next button when last user message is visible", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to bottom
      await chatPage.chat.navigation.scrollToBottom();

      // Wait for next button to disappear
      await expect(chatPage.chat.navigation.nextButton).not.toBeVisible({
        timeout: 2000,
      });
    });

    test("should not show next button when last user message leaves viewport through top", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to very bottom (past all messages)
      await chatPage.chat.navigation.scrollToBottom();

      // Wait for observer to update
      await page.waitForTimeout(500);

      // Next button should NOT be visible (last message is above, not below)
      await expect
        .soft(chatPage.chat.navigation.nextButton)
        .not.toBeVisible();
    });

    test("should navigate to next user message when clicking next", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to top
      await chatPage.chat.navigation.scrollToTop();

      // Wait for next button to appear
      await expect(chatPage.chat.navigation.nextButton).toBeVisible({
        timeout: 2000,
      });

      const initialScrollTop = await chatPage.chat.navigation.getScrollTop();

      // Click next button
      await chatPage.chat.navigation.clickNext();

      // Wait for smooth scroll animation to complete
      await page.waitForTimeout(800);

      // Should have scrolled down
      const newScrollTop = await chatPage.chat.navigation.getScrollTop();
      expect.soft(newScrollTop).toBeGreaterThan(initialScrollTop);
    });
  });

  test.describe("Bottom button", () => {
    test("should show bottom button when not at bottom of chat", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to top
      await chatPage.chat.navigation.scrollToTop();

      // Wait for bottom button to appear
      await expect.soft(chatPage.chat.navigation.bottomButton).toBeVisible({
        timeout: 2000,
      });
    });

    test("should not show bottom button when at bottom of chat", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to bottom
      await chatPage.chat.navigation.scrollToBottom();

      // Wait for bottom button to disappear
      await expect(chatPage.chat.navigation.bottomButton).not.toBeVisible({
        timeout: 2000,
      });
    });

    test("should scroll to bottom when clicking bottom button", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to top
      await chatPage.chat.navigation.scrollToTop();

      // Wait for bottom button to appear
      await expect(chatPage.chat.navigation.bottomButton).toBeVisible({
        timeout: 2000,
      });

      // Click bottom button
      await chatPage.chat.navigation.clickBottom();

      // Wait for smooth scroll animation to complete
      await page.waitForTimeout(800);

      // Should be near bottom
      const scrollTop = await chatPage.chat.navigation.getScrollTop();
      const scrollHeight = await chatPage.chat.navigation.getScrollHeight();
      const clientHeight = await chatPage.chat.navigation.getClientHeight();

      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      expect.soft(distanceFromBottom).toBeLessThan(100);
    });
  });

  test.describe("Button positioning", () => {
    test("buttons should maintain fixed x-axis positions when appearing and disappearing", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();
      await page.waitForTimeout(500);

      // Scroll to a position where prev button is visible
      const message3Pos =
        await chatPage.chat.navigation.getUserMessageScrollPosition(3);
      await chatPage.chat.navigation.scrollToPosition(message3Pos);

      // Wait for prev button to appear
      await expect(chatPage.chat.navigation.prevButton).toBeVisible({
        timeout: 2000,
      });

      // Get prev button position
      const prevBox1 = await chatPage.chat.navigation.prevButton.boundingBox();
      const prevX1 = prevBox1?.x;

      // Scroll to different position (still showing prev)
      const message5Pos =
        await chatPage.chat.navigation.getUserMessageScrollPosition(5);
      await chatPage.chat.navigation.scrollToPosition(message5Pos);
      await page.waitForTimeout(500);

      // Prev button should still be at same x position
      const prevBox2 = await chatPage.chat.navigation.prevButton.boundingBox();
      const prevX2 = prevBox2?.x;

      expect.soft(prevX2).toBe(prevX1);
    });
  });
});
