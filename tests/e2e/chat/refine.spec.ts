import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Prompt Refiner", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should refine the prompt and allow undoing", async ({ page }) => {
    const initialPrompt = "hello world";
    const refinedPrompt = "hello world, how are you?";

    await page.route("/api/refine-prompt", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ text: refinedPrompt }),
        });
      }
    });

    await chatPage.chat.typeMessage(initialPrompt);
    await chatPage.chat.clickRefineButton();

    await expect.soft(chatPage.chat.chatInput).toHaveValue(refinedPrompt);
    await expect.soft(chatPage.chat.undoButton).toBeVisible();

    await chatPage.chat.clickUndoButton();

    await expect.soft(chatPage.chat.chatInput).toHaveValue(initialPrompt);
    await expect.soft(chatPage.chat.undoButton).not.toBeVisible();
  });
});
