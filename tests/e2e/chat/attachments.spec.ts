import { test, expect } from "../fixtures";
import { ChatPage } from "./chat.page";

test.describe("Chat attachments", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should not show attachment button for text-only models", async () => {
    // Models with no `supportedFiles` property should not show the attachment button
    await chatPage.header.selectModel("Qwen3 Next Instruct");
    await expect.soft(chatPage.attachmentButton).not.toBeVisible();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.header.selectModel("Llama 4 Scout");
    await expect.soft(chatPage.attachmentButton).toBeVisible();

    await chatPage.openAttachmentMenu();
    expect.soft(chatPage.imageInputLabel).toBeVisible();
    expect.soft(chatPage.pdfInputLabel).not.toBeVisible();
  });

  test("should show correct attachment options for all supported models", async () => {
    await chatPage.header.selectModel("GPT 5 Mini");
    await expect.soft(chatPage.attachmentButton).toBeVisible();

    await chatPage.openAttachmentMenu();
    expect.soft(chatPage.imageInputLabel).toBeVisible();
    expect.soft(chatPage.pdfInputLabel).toBeVisible();
  });

  test("should filter models based on attachment type", async () => {
    // Start with a model that allows attachments to ensure the button is visible
    await chatPage.header.selectModel("Llama 4 Scout");

    // Upload an image
    await chatPage.openAttachmentMenu();
    await chatPage.uploadFile("./tests/mocks/dummy-image.png", "image");
    await expect
      .soft(chatPage.getThumbnailByAltText("dummy-image.png"))
      .toBeVisible();

    // Get available models after upload
    await chatPage.header.openSelectModelDropdown();
    await expect
      .soft(chatPage.header.getModelOption("Llama 4 Maverick"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Gemini 2.5 Flash Lite"))
      .toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Qwen3 Coder"))
      .not.toBeAttached();
    await expect
      .soft(chatPage.header.getModelOption("Deepseek Chat"))
      .not.toBeAttached();
  });
});
