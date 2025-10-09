import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should handle tool configuration and model filtering correctly", async () => {
    // 1. Select a model that does not support tools ("Sonar Pro")
    await chatPage.selectModel("Sonar Pro");

    // 2. Verify that the tools control button is not visible
    await expect(chatPage.toolsControl).not.toBeVisible();

    // 3. Select a model that supports tools ("Claude Sonnet 4.5")
    await chatPage.selectModel("Claude Sonnet 4.5");

    // 4. Verify that the tools control button is visible
    await expect(chatPage.toolsControl).toBeVisible();

    // 5. Enable the RAG tool
    await chatPage.toggleTool("rag");

    // 6. Open the model picker and verify that only models with tool support are visible
    await chatPage.openSelectModelDropdown();
    await expect(chatPage.getModelOption("Sonar Pro")).not.toBeAttached();
    await expect(chatPage.getModelOption("Claude Sonnet 4.5")).toBeAttached();
    await chatPage.closeDropdown(); // Close the dropdown

    // 7. Disable the RAG tool
    await chatPage.toggleTool("rag");

    // 8. Open the model picker and verify that all models are visible again
    await chatPage.openSelectModelDropdown();
    await expect(chatPage.getModelOption("Sonar Pro")).toBeAttached();
    await expect(chatPage.getModelOption("Gemini 2.5 Pro")).toBeAttached();
    await chatPage.closeDropdown(); // Close the dropdown
  });
});
