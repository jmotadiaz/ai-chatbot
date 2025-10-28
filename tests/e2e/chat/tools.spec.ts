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

    // First, click on toolsControl to open the dropdown
    await chatPage.chat.toolsControl.click();
    // Then use toggleTool to enable the RAG tool
    await chatPage.chat.tools.toggleTool("rag", chatPage.dropdownBackdrop);

    await chatPage.header.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.getModelOption("Sonar Pro"))
      .not.toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Claude Sonnet 4.5"))
      .toBeAttached();
    await chatPage.closeDropdown();

    // Click on toolsControl again to open the dropdown
    await chatPage.chat.toolsControl.click();
    // Then use toggleTool to disable the RAG tool
    await chatPage.chat.tools.toggleTool("rag", chatPage.dropdownBackdrop);

    await chatPage.header.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.getModelOption("Sonar Pro"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Gemini 2.5 Pro"))
      .toBeAttached();
  });

  test("should show tool configuration options when tools are enabled", async () => {
    // Select a model that supports tools
    await chatPage.header.selectModel("Claude Sonnet 4.5");

    // Enable RAG tool
    await chatPage.chat.toolsControl.click();
    await chatPage.chat.tools.toggleTool("rag", chatPage.dropdownBackdrop);

    // Open settings to check if RAG configuration options are available
    await chatPage.chat.openSettings();

    // Check that RAG configuration options are visible
    await expect(chatPage.chat.settings.ragSimilarityInput).toBeVisible();
    await expect(chatPage.chat.settings.ragMaxResourcesInput).toBeVisible();

    // Close settings dropdown
    await chatPage.closeDropdown();

    // Enable Web Search tool
    await chatPage.chat.toolsControl.click();
    await chatPage.chat.tools.toggleTool(
      "web-search",
      chatPage.dropdownBackdrop
    );

    // Open settings to check if Web Search configuration options are available
    await chatPage.chat.openSettings();

    // Check that Web Search configuration options are visible
    await expect(chatPage.chat.settings.webSearchNumResultsInput).toBeVisible();

    // Close settings dropdown
    await chatPage.closeDropdown();

    // Disable both tools
    await chatPage.chat.toolsControl.click();
    await chatPage.chat.tools.toggleTool("rag", chatPage.dropdownBackdrop);

    await chatPage.chat.toolsControl.click();
    await chatPage.chat.tools.toggleTool(
      "web-search",
      chatPage.dropdownBackdrop
    );
  });
});
