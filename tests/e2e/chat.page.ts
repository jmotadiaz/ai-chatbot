import { Page, Locator, expect } from "@playwright/test";

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
  readonly ragToolToggle: Locator;
  readonly webSearchToolToggle: Locator;
  readonly temperatureInput: Locator;
  readonly topPInput: Locator;
  readonly topKInput: Locator;
  readonly dropdownBackdrop: Locator;

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
    this.loadingIndicator = page.locator(
      '[data-testid="loading"], .loading, [aria-busy="true"]'
    );

    // Settings elements
    this.modelPicker = page.locator(
      '[role="combobox"][aria-controls="dropdown-header-model-picker"]'
    );
    this.settingsButton = page.locator('button[aria-label="Chat settings"]');
    this.toolsControl = page.locator('button[aria-label="Configure tools"]');
    this.ragToolToggle = page.locator('label[for="rag-tool"]');
    this.webSearchToolToggle = page.locator('label[for="rag-tool"]');
    this.temperatureInput = page.locator("#temperature");
    this.topPInput = page.locator("#topP");
    this.topKInput = page.locator("#topK");
    this.dropdownBackdrop = page.locator('[data-testid="backdrop"]');
  }

  /**
   * Get a locator for a model option by its name to check visibility
   * @param modelName The name of the model
   */
  getModelOption(modelName: string): Locator {
    return this.page.locator(`[role="option"]:has-text("${modelName}")`);
  }

  /**
   * Toggle a tool by its name
   * @param toolName The name of the tool to toggle
   */
  async toggleTool(toolName: "rag" | "web-search") {
    await this.toolsControl.click();
    if (toolName === "rag") {
      await this.ragToolToggle.click();
    } else if (toolName === "web-search") {
      await this.webSearchToolToggle.click();
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
   * Wait for assistant response to appear
   */
  async waitForAssistantResponse(timeout = 30000) {
    await this.page.waitForTimeout(1000);

    // Wait for at least one assistant message to be visible
    await expect(this.assistantMessages.first()).toBeVisible({ timeout });
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
      await this.loadingIndicator.waitFor({ state: "hidden", timeout });
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
   * Verify that an assistant response exists and contains text
   */
  async verifyAssistantResponded() {
    const lastMessage = await this.getLastAssistantMessage();
    expect(lastMessage).not.toBeNull();
    expect(lastMessage).not.toBe("");
    expect(lastMessage!.length).toBeGreaterThan(0);
  }

  /**
   * Verify assistant response contains specific text
   */
  async verifyAssistantResponseContains(expectedText: string) {
    const lastMessage = await this.getLastAssistantMessage();
    expect(lastMessage).toContain(expectedText);
  }

  /**
   * Select a model from the model picker
   */
  async selectModel(modelName: string) {
    await this.modelPicker.click();
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
}
