import { Page, Locator } from "@playwright/test";

/**
 * Component Object Model for Sidebar functionality
 * Encapsulates sidebar interactions and elements
 */
export class SidebarComponent {
  readonly page: Page;
  // Sidebar elements
  readonly sidebarToggleButton: Locator;
  readonly chatList: Locator;
  readonly sidebarContainer: Locator;

  constructor(page: Page) {
    this.page = page;

    this.sidebarToggleButton = page.locator('[aria-label="Toggle sidebar"]');
    this.chatList = page.locator('[aria-label="Chat history"]');
    this.sidebarContainer = page.locator('[data-testid="sidebar"]');
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
}
