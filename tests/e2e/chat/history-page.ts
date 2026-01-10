import { Page, Locator, expect } from "@playwright/test";
import { ConfirmModalComponent } from "../components/confirm-modal.component";

/**
 * Page Object Model for Chat History page
 * Encapsulates history page interactions and elements
 */
export class HistoryPage {
  readonly page: Page;
  readonly historyList: Locator;
  readonly filterInput: Locator;
  readonly pageTitle: Locator;
  readonly confirmModal: ConfirmModalComponent;

  constructor(page: Page) {
    this.page = page;
    this.historyList = page.locator('ul[aria-label="Chat history list"]');
    this.filterInput = page.getByPlaceholder("Filter chats...");
    this.pageTitle = page
      .getByRole("heading", { name: "Chat History" })
      .first();
    this.confirmModal = new ConfirmModalComponent(page.locator("body"));
  }

  getChatItem(title: string): Locator {
    return this.historyList.locator("li").filter({ hasText: title });
  }

  getDeleteButton(title: string): Locator {
    return this.getChatItem(title).getByRole("button", {
      name: `Delete chat ${title}`,
    });
  }

  getPinButton(title: string): Locator {
    // The pin button aria-label toggles between "Pin chat" and "Unpin chat"
    // We can use a partial match or try to find either
    return this.getChatItem(title).getByRole("button", {
      name: /pin chat/i,
    });
  }

  async goto() {
    await this.page.goto("/chat/history");
  }

  async filter(text: string) {
    await this.filterInput.fill(text);
  }

  async clearFilter() {
    await this.filterInput.fill("");
  }

  async deleteChat(title: string) {
    await this.getDeleteButton(title).click();
  }

  async togglePinChat(title: string) {
    await this.getPinButton(title).click();
  }

  async scrollToBottom() {
    await this.historyList.evaluate((el) => (el.scrollTop = el.scrollHeight));
  }

  async getItemCount(): Promise<number> {
    return await this.historyList.locator("li").count();
  }

  async assertChatVisible(title: string) {
    await expect(async () => {
      await expect(
        this.historyList.getByText(title, { exact: true })
      ).toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000],
      timeout: 10_000,
    });
  }

  async assertChatHidden(title: string) {
    await expect(async () => {
      await expect(
        this.historyList.getByText(title, { exact: true })
      ).not.toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000],
      timeout: 10_000,
    });
  }

  async assertItemCountGreaterThan(count: number) {
    await expect(async () => {
      const itemCount = await this.getItemCount();
      expect(itemCount).toBeGreaterThan(count);
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }
}
