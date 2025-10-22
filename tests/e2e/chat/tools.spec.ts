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
    await chatPage.header.selectModel("Sonar Pro");
    await expect.soft(chatPage.chat.toolsControl).not.toBeVisible();

    await chatPage.header.selectModel("Claude Sonnet 4.5");
    await expect.soft(chatPage.chat.toolsControl).toBeVisible();

    await chatPage.chat.toggleTool("rag", chatPage.dropdownBackdrop);
    await chatPage.header.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.getModelOption("Sonar Pro"))
      .not.toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Claude Sonnet 4.5"))
      .toBeAttached();
    await chatPage.closeDropdown();

    await chatPage.chat.toggleTool("rag", chatPage.dropdownBackdrop);
    await chatPage.header.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.getModelOption("Sonar Pro"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Gemini 2.5 Pro"))
      .toBeAttached();
  });
});
