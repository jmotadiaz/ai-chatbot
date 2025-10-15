import { Page, Locator, expect } from "@playwright/test";
import type { chatModelId } from "@/lib/ai/models/definition";

/**
 * Page Object Model for Chat functionality
 * Encapsulates chat page interactions and elements
 */
export class ChatPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly submitButton: Locator;
  readonly messagesContainer: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly loadingIndicator: Locator;
  readonly modelPicker: Locator;
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
  readonly fileInput: Locator;
  readonly imageInputLabel: Locator;
  readonly pdfInputLabel: Locator;
  readonly imageInputFile: Locator;
  readonly pdfInputFile: Locator;
  // Sidebar elements
  readonly sidebarToggleButton: Locator;
  readonly chatList: Locator;
  readonly sidebar: Locator;
  readonly refineButton: Locator;
  readonly undoButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main chat elements
    this.chatInput = page.locator("[data-testid='chat-input']");
    this.submitButton = page
      .locator('button[type="submit"]:not(:disabled)')
      .last();
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
    this.loadingIndicator = page.locator('[data-testid="loading-message"]');

    // Settings elements
    this.modelPicker = page.locator(
      '[role="combobox"][aria-controls="dropdown-header-model-picker"]'
    );
    this.settingsButton = page.locator('button[aria-label="Chat settings"]');
    this.toolsControl = page.locator('button[aria-label="Configure tools"]');
    this.ragToolLabel = page.locator('label[for="rag-tool"]');
    this.webSearchToolLabel = page.locator('label[for="rag-tool"]');
    this.temperatureInput = page.locator("#temperature");
    this.topPInput = page.locator("#topP");
    this.topKInput = page.locator("#topK");
    this.dropdownBackdrop = page.locator('[data-testid="backdrop"]');
    // Attachment elements
    this.attachmentButton = page.locator('button[aria-label="Attach files"]');
    this.attachmentMenu = page.locator('[aria-label="Attachment options"]');
    this.fileInput = page.locator('input[type="file"]');
    this.imageInputLabel = page.locator('label[for="image-input"]');
    this.pdfInputLabel = page.locator('label[for="document-input"]');
    this.imageInputFile = page.locator("#image-input");
    this.pdfInputFile = page.locator("#document-input");
    this.sidebarToggleButton = page.locator('[aria-label="Toggle sidebar"]');
    this.chatList = page.locator('[aria-label="Chat history"]');
    this.sidebar = page.locator('[data-testid="sidebar"]');

    // Refine elements
    this.refineButton = page.locator('button[aria-label="Refine prompt"]');
    this.undoButton = page.locator('button[aria-label="Undo refined prompt"]');
  }

  /**
   * Get a locator for a model option by its name to check visibility
   * @param modelName The name of the model
   */
  getModelOption(modelName: chatModelId): Locator {
    return this.page.locator(`[role="option"]:has-text("${modelName}")`);
  }

  /**
   * Toggle a tool by its name
   * @param toolName The name of the tool to toggle
   */
  async toggleTool(toolName: "rag" | "web-search") {
    await this.toolsControl.click();
    if (toolName === "rag") {
      await this.ragToolLabel.click();
    } else if (toolName === "web-search") {
      await this.webSearchToolLabel.click();
    }
    // Click backdrop to close dropdown
    await this.closeDropdown();
  }

  /**
   * Navigate to the chat page
   */
  async goto(chatId?: string) {
    const url = chatId ? `/${chatId}` : "/";
    await this.page.goto(url);
  }

  /**
   * Type a message in the chat input
   */
  async typeMessage(message: string) {
    await this.chatInput.fill(message);
  }

  /**
   * Submit the current message
   */
  async submitMessage() {
    await this.submitButton.click();
  }

  /**
   * Send a message (type + submit)
   */
  async sendMessage(message: string) {
    await this.typeMessage(message);
    await this.submitMessage();
  }

  /**
   * Get all user messages text
   */
  async getUserMessages(): Promise<string[]> {
    const count = await this.userMessages.count();
    const messages: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await this.userMessages.nth(i).textContent();
      if (text) messages.push(text.trim());
    }

    return messages;
  }

  /**
   * Get all assistant messages text
   */
  async getAssistantMessages(): Promise<string[]> {
    const count = await this.assistantMessages.count();
    const messages: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await this.assistantMessages.nth(i).textContent();
      if (text) messages.push(text.trim());
    }

    return messages;
  }

  /**
   * Get the last assistant message
   */
  async getLastAssistantMessage(): Promise<string | null> {
    const messages = await this.getAssistantMessages();
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(timeout = 30000) {
    try {
      await this.loadingIndicator.waitFor({ state: "attached", timeout });
      await this.loadingIndicator.waitFor({ state: "detached", timeout });
    } catch {
      // If no loading indicator exists, that's fine
    }
  }

  /**
   * Check if chat input is enabled
   */
  async isChatInputEnabled(): Promise<boolean> {
    return await this.chatInput.isEnabled();
  }

  /**
   * Verify assistant response contains specific text
   */
  async verifyAssistantResponseContains(expectedText: string) {
    const lastMessage = await this.getLastAssistantMessage();
    expect(lastMessage).toContain(expectedText);
  }

  async openSelectModelDropdown() {
    await this.modelPicker.click();
  }

  /**
   * Select a model from the model picker
   */
  async selectModel(modelName: chatModelId) {
    await this.openSelectModelDropdown();
    await this.page
      .locator(
        `#dropdown-header-model-picker [role="option"]:has-text("${modelName}")`
      )
      .click();
  }

  /**
   * Open the settings dropdown
   */
  async openSettings() {
    await this.settingsButton.click();
  }

  async closeDropdown() {
    await this.dropdownBackdrop.click();
  }

  /**
   * Set the value of a number input
   */
  private async setInputValue(input: Locator, value: number) {
    await input.click();
    await input.fill(value.toString());
  }

  /**
   * Set the temperature value
   */
  async setTemperature(value: number) {
    await this.setInputValue(this.temperatureInput, value);
  }

  /**
   * Set the topP value
   */
  async setTopP(value: number) {
    await this.setInputValue(this.topPInput, value);
  }

  /**
   * Set the topK value
   */
  async setTopK(value: number) {
    await this.setInputValue(this.topKInput, value);
  }

  /**
   * Get the value of an input
   */
  private async getInputValue(input: Locator): Promise<number> {
    const value = await input.inputValue();
    return parseFloat(value);
  }

  /**
   * Get the temperature value
   */
  async getTemperature(): Promise<number> {
    return this.getInputValue(this.temperatureInput);
  }

  /**
   * Get the topP value
   */
  async getTopP(): Promise<number> {
    return this.getInputValue(this.topPInput);
  }

  /**
   * Get the topK value
   */
  async getTopK(): Promise<number> {
    return this.getInputValue(this.topKInput);
  }

  /**
   * Check if the settings button is visible
   */
  async areSettingsVisible(): Promise<boolean> {
    return this.settingsButton.isVisible();
  }

  /**
   * Check if the attachment button is visible
   */
  async isAttachmentButtonVisible(): Promise<boolean> {
    return this.attachmentButton.isVisible();
  }

  /**
   * Open the attachment menu
   */
  async openAttachmentMenu() {
    await this.attachmentButton.click();
  }

  /**
   * Upload a file
   * @param filePath - The path to the file to upload
   * @param fileType - The type of file to upload
   */
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
   * Get the available models from the model picker
   */
  async getAvailableModels(): Promise<string[]> {
    await this.modelPicker.click();
    const options = await this.page.locator('[role="option"]').allInnerTexts();
    await this.closeDropdown();
    return options;
  }
  /**
   * Toggle the sidebar
   */
  async toggleSidebar() {
    await this.sidebarToggleButton.click();
  }

  /**
   * Get all chat titles from the sidebar
   */
  getChatItemByTitle(title: string): Locator {
    return this.chatList
      .getByText(title, { exact: true })
      .locator('xpath=ancestor::div[@role="listitem"]');
  }

  /**
   * Delete a chat by its title
   * @param title The title of the chat to delete
   */
  async deleteChat(title: string) {
    await this.getChatItemByTitle(title).getByLabel("Delete chat").click();
  }

  /**
   * Click on a chat in the sidebar by its title
   * @param title The title of the chat to click
   */
  async clickChatByTitle(title: string) {
    await this.chatList.getByText(title, { exact: true }).click();
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

  /**
   * Check if the refine button is visible
   */
  async isRefineButtonVisible(): Promise<boolean> {
    return this.refineButton.isVisible();
  }

  /**
   * Check if the undo button is visible
   */
  async isUndoButtonVisible(): Promise<boolean> {
    return this.undoButton.isVisible();
  }
}
