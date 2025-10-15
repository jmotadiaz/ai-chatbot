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
    await chatPage.selectModel("Qwen3 Next Instruct");
    await expect(chatPage.attachmentButton).not.toBeVisible();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.selectModel("Llama 4 Scout");
    await expect(chatPage.attachmentButton).toBeVisible();

    await chatPage.openAttachmentMenu();
    expect(chatPage.imageInputLabel).toBeVisible();
    expect(chatPage.pdfInputLabel).not.toBeVisible();
  });

  test("should show correct attachment options for all supported models", async () => {
    await chatPage.selectModel("GPT 5 Mini");
    await expect(chatPage.attachmentButton).toBeVisible();

    await chatPage.openAttachmentMenu();
    expect(chatPage.imageInputLabel).toBeVisible();
    expect(chatPage.pdfInputLabel).toBeVisible();
  });

  test("should filter models based on attachment type", async () => {
    // Start with a model that allows attachments to ensure the button is visible
    await chatPage.selectModel("Llama 4 Scout");

    // Upload an image
    await chatPage.openAttachmentMenu();
    await chatPage.uploadFile("./tests/mocks/dummy-image.png", "image");
    await expect(
      chatPage.getThumbnailByAltText("dummy-image.png")
    ).toBeVisible();

    // Get available models after upload
    await chatPage.openSelectModelDropdown();
    await expect(chatPage.getModelOption("Llama 4 Maverick")).toBeAttached();
    await expect(
      chatPage.getModelOption("Gemini 2.5 Flash Lite")
    ).toBeAttached();
    await expect(chatPage.getModelOption("Qwen3 Coder")).not.toBeAttached();
    await expect(chatPage.getModelOption("Deepseek Chat")).not.toBeAttached();
  });
});
