import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should handle tool configuration and model filtering correctly", async () => {
    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("rag");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Sonar Pro");
    await expect.soft(chatPage.chat.toolsControl).not.toBeVisible();

    await chatPage.header.modelPicker.selectModel("Gemini 3 Flash");
    await expect.soft(chatPage.chat.toolsControl).toBeVisible();

    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("web-search");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Sonar Pro"))
      .not.toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Gemini 3 Flash"))
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
});
