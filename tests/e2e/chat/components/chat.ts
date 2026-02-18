import { Locator, expect } from "@playwright/test";
import { ToolsComponent } from "@/tests/e2e/chat/components/tools";
import { SettingsComponent } from "@/tests/e2e/chat/components/settings";
import { NavigationComponent } from "@/tests/e2e/chat/components/navigation";

/**
 * Component Object Model for Chat functionality
 * Encapsulates chat message interactions and elements
 */
export class ChatComponent {
  readonly container: Locator;
  readonly chatInput: Locator;
  readonly submitButton: Locator;
  readonly messagesContainer: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly loadingIndicator: Locator;
  readonly refineButton: Locator;
  readonly undoButton: Locator;
  readonly attachmentButton: Locator;
  readonly attachmentMenu: Locator;
  readonly imageInputFile: Locator;
  readonly pdfInputFile: Locator;
  readonly imageInputLabel: Locator;
  readonly pdfInputLabel: Locator;
  readonly settingsButton: Locator;
  readonly toolsControl: Locator;
  readonly tools: ToolsComponent;
  readonly settings: SettingsComponent;
  readonly navigation: NavigationComponent;

  constructor(container: Locator) {
    this.container = container;

    this.chatInput = container.locator("[data-testid='chat-input']").first();
    this.submitButton = container.getByLabel("Send message").first();
    this.messagesContainer = container
      .locator('[data-testid="messages"], .messages, div')
      .filter({ hasText: /user|assistant/i })
      .first();

    this.userMessages = container.locator(
      '[data-role="user"], [data-message-role="user"]',
    );
    this.assistantMessages = container.locator(
      '[data-role="assistant"], [data-message-role="assistant"]',
    );

    this.loadingIndicator = container.getByTestId("loading-message");

    this.refineButton = container.getByLabel("Refine prompt");
    this.undoButton = container.getByLabel("Undo refined prompt");

    this.attachmentButton = container.getByLabel("Attach files");
    this.attachmentMenu = container.getByLabel("Attachment options");
    this.imageInputFile = container.getByLabel("Image");
    this.pdfInputFile = container.getByLabel("Document");
    this.imageInputLabel = this.attachmentMenu.getByText("Image");
    this.pdfInputLabel = this.attachmentMenu.getByText("Document");

    this.settingsButton = container.getByLabel("Model settings");

    this.toolsControl = container.getByLabel("Configure tools");
    this.tools = new ToolsComponent(container);
    this.settings = new SettingsComponent(container);
    this.navigation = new NavigationComponent(container);
  }

  async getUserMessages(): Promise<string[]> {
    return await this.userMessages.allTextContents();
  }

  async getAssistantMessages(): Promise<string[]> {
    return await this.assistantMessages.allTextContents();
  }

  async getLastAssistantMessage(): Promise<string | null> {
    const messages = await this.getAssistantMessages();
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  async waitForLoadingComplete(timeout = 10000) {
    // Simply wait for loading indicator to be gone (or never appear)
    // This avoids race conditions when responses are fast
    await expect(this.loadingIndicator).not.toBeVisible({ timeout });
  }

  async waitForAssistantMessage(nth: number = 0, timeout = 30000) {
    await expect(this.assistantMessages.nth(nth)).toBeVisible({ timeout });
  }

  async typeMessage(message: string) {
    await this.chatInput.fill(message);
  }

  async submitMessage() {
    await this.submitButton.click();
  }

  async sendMessage(message: string) {
    await this.typeMessage(message);
    await this.submitMessage();
  }

  async clickRefineButton() {
    await this.refineButton.click();
  }

  async clickUndoButton() {
    await this.undoButton.click();
  }

  async openTools() {
    await this.toolsControl.click();
  }

  async openAttachmentMenu() {
    await this.attachmentButton.click();
    await this.attachmentMenu.waitFor({ state: "visible", timeout: 1000 });
  }

  async uploadFile(filePath: string, fileType: "image" | "pdf") {
    await this.container.page().route("**/api/upload", async (route) => {
      const json = {
        url: `https://fake-blob-storage.com/${filePath}`,
        pathname: filePath,
        contentType: fileType === "image" ? "image/png" : "application/pdf",
        contentDisposition: `attachment; filename="${filePath}"`,
      };
      await route.fulfill({ json });
    });

    if (fileType === "image") {
      await this.imageInputFile.setInputFiles(filePath);
    } else if (fileType === "pdf") {
      await this.pdfInputFile.setInputFiles(filePath);
    }
  }

  getImgPreviewByAltText(altText: string): Locator {
    return this.container
      .getByTestId("attachments-preview")
      .locator(`img[alt="${altText}"]`);
  }

  async openSettings() {
    await this.settingsButton.click();
  }
}
