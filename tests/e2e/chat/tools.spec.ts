import { test, expect } from "../fixtures";
import { ChatPage } from "./chat.page";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should handle tool configuration and model filtering correctly", async () => {
    await chatPage.selectModel("Sonar Pro");
    await expect(chatPage.toolsControl).not.toBeVisible();

    await chatPage.selectModel("Claude Sonnet 4.5");
    await expect(chatPage.toolsControl).toBeVisible();

    await chatPage.toggleTool("rag");
    await chatPage.openSelectModelDropdown();
    await expect(chatPage.getModelOption("Sonar Pro")).not.toBeAttached();
    await expect(chatPage.getModelOption("Claude Sonnet 4.5")).toBeAttached();
    await chatPage.closeDropdown();

    await chatPage.toggleTool("rag");
    await chatPage.openSelectModelDropdown();
    await expect(chatPage.getModelOption("Sonar Pro")).toBeAttached();
    await expect(chatPage.getModelOption("Gemini 2.5 Pro")).toBeAttached();
    await chatPage.closeDropdown();
  });
});
