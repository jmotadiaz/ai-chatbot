import { Page, Locator } from "@playwright/test";
import { SidebarComponent } from "@/tests/e2e/chat/sidebar.component";
import { HeaderComponent } from "@/tests/e2e/chat/header.component";

/**
 * Page Object Model for Chat functionality
 * Encapsulates chat page interactions and elements
 */
export class ChatPage {
  readonly page: Page;
  readonly header: HeaderComponent;
  readonly sidebar: SidebarComponent;
  readonly chatInput: Locator;
  readonly submitButton: Locator;
  readonly messagesContainer: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly loadingIndicator: Locator;
  readonly settingsButton: Locator;
  readonly toolsControl: Locator;
  readonly ragToolLabel: Locator;
  readonly webSearchToolLabel: Locator;
  readonly temperatureInput: Locator;
  readonly topPInput: Locator;
  readonly topKInput: Locator;
  readonly dropdownBackdrop: Locator;
  readonly attachmentButton: Locator;
  readonly attachmentMenu: Locator;
  readonly imageInputFile: Locator;
  readonly pdfInputFile: Locator;
  readonly imageInputLabel: Locator;
  readonly pdfInputLabel: Locator;
  readonly refineButton: Locator;
  readonly undoButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = new HeaderComponent(page);
    this.sidebar = new SidebarComponent(page);

    // Main chat elements
    this.chatInput = page.locator("[data-testid='chat-input']");
    this.submitButton = page.getByLabel("Send message");
    this.messagesContainer = page
      .locator('[data-testid="messages"], .messages, div')
      .filter({ hasText: /user|assistant/i })
      .first();

    // Message types
    this.userMessages = page.locator(
      '[data-role="user"], [data-message-role="user"]'
    );
    this.assistantMessages = page.locator(
      '[data-role="assistant"], [data-message-role="assistant"]'
    );

    // Loading state
    this.loadingIndicator = page.getByTestId("loading-message");

    this.settingsButton = page.getByLabel("Chat settings");
    this.toolsControl = page.getByLabel("Configure tools");
    this.ragToolLabel = page.locator('label[for="rag-tool"]');
    this.webSearchToolLabel = page.locator('label[for="rag-tool"]');
    this.temperatureInput = page.getByLabel("Temperature");
    this.topPInput = page.getByLabel("Top P");
    this.topKInput = page.getByLabel("Top K");
    this.dropdownBackdrop = page.getByTestId("backdrop");
    // Attachment elements
    this.attachmentButton = page.getByLabel("Attach files");
    this.attachmentMenu = page.getByLabel("Attachment options");
    this.imageInputFile = page.getByLabel("Image");
    this.pdfInputFile = page.getByLabel("Document");
    this.imageInputLabel = this.attachmentMenu.getByText("Image");
    this.pdfInputLabel = this.attachmentMenu.getByText("Document");

    // Refine elements
    this.refineButton = page.getByLabel("Refine prompt");
    this.undoButton = page.getByLabel("Undo refined prompt");
  }

  async toggleTool(toolName: "rag" | "web-search") {
    await this.toolsControl.click();
    if (toolName === "rag") {
      await this.ragToolLabel.click();
    } else if (toolName === "web-search") {
      await this.webSearchToolLabel.click();
    }
    await this.closeDropdown();
  }

  async goto(chatId?: string) {
    const url = chatId ? `/${chatId}` : "/";
    await this.page.goto(url);
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

  async getUserMessages(): Promise<string[]> {
    const count = await this.userMessages.count();
    const messages: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await this.userMessages.nth(i).textContent();
      if (text) messages.push(text.trim());
    }

    return messages;
  }

  async getAssistantMessages(): Promise<string[]> {
    const count = await this.assistantMessages.count();
    const messages: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await this.assistantMessages.nth(i).textContent();
      if (text) messages.push(text.trim());
    }

    return messages;
  }

  async getLastAssistantMessage(): Promise<string | null> {
    const messages = await this.getAssistantMessages();
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  async waitForLoadingComplete(timeout = 30000) {
    try {
      await this.loadingIndicator.waitFor({ state: "attached", timeout });
      await this.loadingIndicator.waitFor({ state: "detached", timeout });
    } catch {
      // If no loading indicator exists, that's fine
    }
  }

  async closeDropdown() {
    await this.dropdownBackdrop.click({ position: { x: 10, y: 10 } });
  }

  async openSettings() {
    await this.settingsButton.click();
  }

  /**
   * Set the temperature value
   */
  async setTemperature(value: number) {
    await this.setInputNumberValue(this.temperatureInput, value);
  }

  /**
   * Set the topP value
   */
  async setTopP(value: number) {
    await this.setInputNumberValue(this.topPInput, value);
  }

  /**
   * Set the topK value
   */
  async setTopK(value: number) {
    await this.setInputNumberValue(this.topKInput, value);
  }

  async openAttachmentMenu() {
    await this.attachmentButton.click();
    await this.attachmentMenu.waitFor({ state: "visible", timeout: 1000 });
  }

  async uploadFile(filePath: string, fileType: "image" | "pdf") {
    await this.page.route("**/api/upload", async (route) => {
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

  getThumbnailByAltText(altText: string): Locator {
    return this.page.locator(`img[alt="${altText}"]`);
  }

  /**
   * Click the refine button
   */
  async clickRefineButton() {
    await this.refineButton.click();
  }

  /**
   * Click the undo button
   */
  async clickUndoButton() {
    await this.undoButton.click();
  }

  private async setInputNumberValue(input: Locator, value: number) {
    await input.fill(value.toString());
  }
}
