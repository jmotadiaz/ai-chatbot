import { test, expect } from "./fixtures";
import { ChatPage } from "./chat.page";
import {
  chatModelKeys,
  languageModelConfigurations,
} from "lib/ai/models/definition";

test.describe("Chat attachments", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should not show attachment button for text-only models", async () => {
    // Models with no `supportedFiles` property should not show the attachment button
    await chatPage.selectModel("Llama 3.1 Instant");
    await expect(chatPage.attachmentButton).not.toBeVisible();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.selectModel("Llama 4 Scout");
    await expect(chatPage.attachmentButton).toBeVisible();

    const options = await chatPage.getAttachmentMenuOptions();
    expect(options).toContain("Image");
    expect(options).not.toContain("PDF");
  });

  test("should show correct attachment options for multi-file models", async () => {
    await chatPage.selectModel("Claude Haiku 3.5");
    await expect(chatPage.attachmentButton).toBeVisible();

    const options = await chatPage.getAttachmentMenuOptions();
    expect(options).toContain("Image");
    expect(options).toContain("PDF");
  });

  test("should filter models based on attachment type", async () => {
    // Start with a model that allows attachments to ensure the button is visible
    await chatPage.selectModel("Claude Haiku 3.5");

    // Upload an image
    await chatPage.uploadFile("dummy-image.png", "image");

    // Get available models after upload
    const availableModels = await chatPage.getAvailableModels();

    // 1. Check for models that SHOULD be visible (support images)
    expect(availableModels).toContain("Llama 4 Scout");
    expect(availableModels).toContain("Claude Haiku 3.5");

    // 2. Check for models that SHOULD NOT be visible (text-only)
    expect(availableModels).not.toContain("Llama 3.1 Instant");
    expect(availableModels).not.toContain("Deepseek Chat");
  });
});