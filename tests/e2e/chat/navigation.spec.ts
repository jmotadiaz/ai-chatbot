import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";
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
      content: `Assistant response ${i}: ${"This is a detailed response to help test scrolling. ".repeat(
        10
      )}`,
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

  test.beforeEach(async ({ db }) => {
    const chats = await db.addChats([
      chatWithManyMessages,
      chatWithSingleMessage,
    ]);
    longChat = chats[0];
    singleMessageChat = chats[1];
  });

  test.describe("Initial scroll position", () => {
    test("should scroll to last user message when loading existing chat", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render and initial scroll
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });
      await chatPage.chat.navigation.waitForMessageInViewport(9);

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
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to top to make first message visible
      await chatPage.chat.navigation.scrollToTop();
      await chatPage.chat.navigation.waitForMessageInViewport(0);

      // Wait for prev button to disappear (if it was visible)
      await chatPage.chat.navigation.assertPrevButtonHidden();
    });

    test("should show prev button when first user message leaves viewport", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll so that message 2 is visible (message 0 leaves viewport)
      await chatPage.chat.navigation.scrollToMessage(2);
      await chatPage.chat.navigation.assertUserMessageInViewport(2);
      await chatPage.chat.navigation.assertUserMessageNotInViewport(0);

      // Wait for prev button to appear
      await chatPage.chat.navigation.assertPrevButtonVisible();
    });

    test("should navigate to previous user message when clicking prev", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to message 5
      await chatPage.chat.navigation.scrollToMessage(5);
      await chatPage.chat.navigation.assertUserMessageInViewport(5);

      // Wait for prev button to be visible
      await chatPage.chat.navigation.assertPrevButtonVisible();

      // Click prev button
      await chatPage.chat.navigation.clickPrev();

      // After clicking prev, we should have navigated to message 4
      await chatPage.chat.navigation.assertUserMessageInViewport(4);
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

      // Wait for observer to update and verify next button is not visible
      await chatPage.chat.navigation.assertNextButtonHidden();
      await expect.soft(chatPage.chat.navigation.nextButton).not.toBeVisible();
    });

    test("should show next button when last user message is below viewport", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for loading to finish and messages to render
      await chatPage.chat.waitForLoadingComplete();
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to top and wait for scroll position to stabilize
      await chatPage.chat.navigation.scrollToTop();
      await chatPage.chat.navigation.assertScrollTopLessThan(50);

      // Wait for next button to appear
      await chatPage.chat.navigation.assertNextButtonVisible();
    });

    test("should not show next button when last user message is visible", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to bottom
      await chatPage.chat.navigation.scrollToBottom();

      // Wait for next button to disappear
      await chatPage.chat.navigation.assertNextButtonHidden();
    });

    test("should not show next button when last user message leaves viewport through top", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await expect(chatPage.chat.userMessages.first()).toBeVisible();

      // Scroll to very bottom (past all messages)
      await chatPage.chat.navigation.scrollToBottom();

      // Wait for scroll to settle and observer to update
      await chatPage.chat.navigation.assertNextButtonHidden();

      // Next button should NOT be visible (last message is above, not below)
      await expect.soft(chatPage.chat.navigation.nextButton).not.toBeVisible();
    });

    test("should navigate to next user message when clicking next", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to top so message 0 is visible
      await chatPage.chat.navigation.scrollToTop();
      await chatPage.chat.navigation.assertUserMessageInViewport(0);

      // Wait for next button to appear
      await chatPage.chat.navigation.assertNextButtonVisible();

      // Click next button
      await chatPage.chat.navigation.clickNext();

      // After clicking next, message 1 should be visible
      await chatPage.chat.navigation.assertUserMessageInViewport(1);
    });
  });

  test.describe("Bottom button", () => {
    test("should show bottom button when not at bottom of chat", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to top
      await chatPage.chat.navigation.scrollToTop();

      // Wait for bottom button to appear
      await chatPage.chat.navigation.assertBottomButtonVisible();
    });

    test("should not show bottom button when at bottom of chat", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Scroll to bottom
      await chatPage.chat.navigation.scrollToBottom();

      // Wait for bottom button to disappear
      await chatPage.chat.navigation.assertBottomButtonHidden();
    });

    test("should scroll to bottom when clicking bottom button", async ({
      page,
    }) => {
      const chatPage = new ChatPage(page);
      await chatPage.goto(longChat.id);

      // Wait for messages to render and loading to finish
      await chatPage.chat.waitForLoadingComplete();
      await chatPage.chat.userMessages.first().waitFor({ state: "visible" });

      // Ensure we are initially at the bottom (default behavior) or have content
      await chatPage.chat.navigation.waitForMessageInViewport(9);

      // Scroll to top
      await chatPage.chat.navigation.scrollToTop();

      // Wait for bottom button to appear
      await chatPage.chat.navigation.assertBottomButtonVisible();

      // Click bottom button
      await chatPage.chat.navigation.clickBottom();

      // Last message (9) should be visible
      await chatPage.chat.navigation.assertUserMessageInViewport(9);
    });
  });
});
