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
    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("rag");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Sonar Pro");
    await expect.soft(chatPage.chat.toolsControl).not.toBeVisible();

    await chatPage.header.modelPicker.selectModel("Claude Sonnet 4.5");
    await expect.soft(chatPage.chat.toolsControl).toBeVisible();

    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("web-search");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Sonar Pro"))
      .not.toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Claude Sonnet 4.5"))
      .toBeAttached();
    await chatPage.closeDropdown();

    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("web-search");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Sonar Pro"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Gemini 3 Pro"))
      .toBeAttached();
  });

  test("should show tool configuration options when tools are enabled", async () => {
    await chatPage.header.modelPicker.selectModel("Claude Sonnet 4.5");

    await chatPage.chat.openSettings();
    await expect(chatPage.chat.settings.ragMaxResourcesInput).toBeVisible();
    await expect(chatPage.chat.settings.ragSimilarityInput).toBeVisible();
    await chatPage.closeDropdown();

    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("rag");
    await chatPage.closeDropdown();

    await chatPage.chat.openSettings();
    await expect(chatPage.chat.settings.ragMaxResourcesInput).not.toBeVisible();
    await expect(chatPage.chat.settings.ragSimilarityInput).not.toBeVisible();
    await chatPage.closeDropdown();

    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("web-search");
    await chatPage.closeDropdown();

    await chatPage.chat.openSettings();
    await expect(chatPage.chat.settings.webSearchNumResultsInput).toBeVisible();
  });
});
