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

  constructor(page: Page) {
    this.page = page;

    // Main chat elements
    this.chatInput = page.locator("[data-testid='chat-input']");
    this.submitButton = page.locator('button[type="submit"]').last();
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
}
