import { Page, Locator, expect } from "@playwright/test";
import { ConfirmModalComponent } from "../components/confirm-modal";

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
    const container = page.getByTestId("history-container");
    this.historyList = container
      .locator('ul[aria-label="Chat history list"]')
      .first();
    this.filterInput = container.getByTestId("chat-history-filter");
    this.pageTitle = container
      .getByRole("heading", { name: "Chat History" })
      .first();
    this.confirmModal = new ConfirmModalComponent(container);
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
    const row = this.getChatItem(title);
    await expect(row).toBeVisible();
    // Force click if the element is moving due to list reordering
    await this.getDeleteButton(title).click({ force: true });
  }

  async togglePinChat(title: string) {
    const row = this.getChatItem(title);
    await expect(row).toBeVisible();
    // Force click if the element is moving due to list reordering
    await this.getPinButton(title).click({ force: true });
  }

  async scrollToBottom() {
    // 1. Get the last visible item before scrolling
    const lastVisibleItem = this.historyList.locator("li").last();

    // 2. Execute scroll with instant behavior
    await this.historyList.evaluate((el) =>
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" }),
    );

    // 3. Confirm scroll success by checking last item is visible
    await expect(lastVisibleItem).toBeVisible();
  }

  async getItemCount(): Promise<number> {
    return await this.historyList.locator("li").count();
  }

  async assertChatVisible(title: string) {
    await expect(async () => {
      await expect(
        this.historyList.getByText(title, { exact: true }),
      ).toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000],
      timeout: 10_000,
    });
  }

  async assertChatHidden(title: string) {
    await expect(async () => {
      await expect(
        this.historyList.getByText(title, { exact: true }),
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
