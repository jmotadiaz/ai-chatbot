import { Locator } from "@playwright/test";

/**
 * Component Object Model for Sidebar functionality
 * Encapsulates sidebar interactions and elements
 */
export class SidebarComponent {
  readonly container: Locator;
  // Sidebar elements
  readonly chatList: Locator;

  constructor(container: Locator) {
    this.container = container;

    this.chatList = container.getByRole("list", { name: "Chat history" });
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
