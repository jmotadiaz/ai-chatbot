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

    // Check that only models supporting images are available
    const imageSupportingModels = chatModelKeys.filter((key) => {
      const model = languageModelConfigurations(key);
      return model.supportedFiles?.includes("img");
    });

    // Also check for models that should NOT be in the list
    const textOnlyModels = chatModelKeys.filter((key) => {
      const model = languageModelConfigurations(key);
      return !model.supportedFiles;
    });

    expect(availableModels.length).toBe(imageSupportingModels.length);

    for (const model of imageSupportingModels) {
      expect(availableModels).toContain(model);
    }

    for (const model of textOnlyModels) {
      expect(availableModels).not.toContain(model);
    }
  });
});