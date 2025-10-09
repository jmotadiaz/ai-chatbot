import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

test.describe("Prompt Refiner", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
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

    await chatPage.typeMessage(initialPrompt);
    await chatPage.clickRefineButton();

    await expect(chatPage.chatInput).toHaveValue(refinedPrompt);
    await expect(chatPage.undoButton).toBeVisible();

    await chatPage.clickUndoButton();

    await expect(chatPage.chatInput).toHaveValue(initialPrompt);
    await expect(chatPage.undoButton).not.toBeVisible();
  });
});