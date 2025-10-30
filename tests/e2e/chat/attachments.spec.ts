import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

test.describe("Chat attachments", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should not show attachment button for text-only models", async () => {
    // Models with no `supportedFiles` property should not show the attachment button
    await chatPage.header.modelPicker.selectModel("Qwen3 Next Instruct");
    await expect.soft(chatPage.chat.attachmentButton).not.toBeVisible();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.header.modelPicker.selectModel("Llama 4 Scout");
    await expect.soft(chatPage.chat.attachmentButton).toBeVisible();

    await chatPage.chat.openAttachmentMenu();
    expect.soft(chatPage.chat.imageInputLabel).toBeVisible();
    expect.soft(chatPage.chat.pdfInputLabel).not.toBeVisible();
  });

  test("should show correct attachment options for all supported models", async () => {
    await chatPage.header.modelPicker.selectModel("GPT 5 Mini");
    await expect.soft(chatPage.chat.attachmentButton).toBeVisible();

    await chatPage.chat.openAttachmentMenu();
    expect.soft(chatPage.chat.imageInputLabel).toBeVisible();
    expect.soft(chatPage.chat.pdfInputLabel).toBeVisible();
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
      .soft(chatPage.header.modelPicker.getModelOption("Llama 4 Maverick"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Gemini 2.5 Flash Lite"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Qwen3 Coder"))
      .not.toBeAttached();
    await expect
      .soft(chatPage.header.modelPicker.getModelOption("Deepseek Chat"))
      .not.toBeAttached();
  });
});
