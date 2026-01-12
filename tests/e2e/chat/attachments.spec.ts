import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat attachments", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.header.modelPicker.selectModel("Llama 4 Scout");

    await chatPage.chat.openAttachmentMenu();
    // Wait for menu content to be visible
    await expect(chatPage.chat.imageInputLabel).toBeVisible();
  });

  test("should filter models based on attachment type", async () => {
    // Start with a model that allows attachments to ensure the button is visible
    await chatPage.header.modelPicker.selectModel("Llama 4 Scout");

    // Upload an image
    await chatPage.chat.openAttachmentMenu();
    await chatPage.chat.uploadFile("./tests/mocks/dummy-image.png", "image");
    await expect
      .soft(chatPage.chat.getImgPreviewByAltText("dummy-image.png"))
      .toBeVisible();

    // Get available models after upload
    await chatPage.header.modelPicker.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Llama 4 Scout"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Deepseek Chat"))
      .not.toBeAttached();
  });
});
