import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat attachments", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.header.modelPicker.selectModel("Gemini 3 Flash");

    await chatPage.chat.openAttachmentMenu();
    // Wait for menu content to be visible
    await expect(chatPage.chat.imageInputLabel).toBeVisible();
  });
});
