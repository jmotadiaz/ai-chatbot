import { Locator } from "@playwright/test";

/**
 * Component Object Model for Chat Navigation
 * Encapsulates navigation button interactions and elements
 */
export class NavigationComponent {
  readonly container: Locator;
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly bottomButton: Locator;
  readonly scrollContainer: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.prevButton = container.getByLabel("Previous message");
    this.nextButton = container.getByLabel("Next message");
    this.bottomButton = container.getByLabel("Scroll to bottom");
    this.scrollContainer = container.locator(".overflow-y-auto");
  }

  async clickPrev() {
    await this.prevButton.click();
  }

  async clickNext() {
    await this.nextButton.click();
  }

  async clickBottom() {
    await this.bottomButton.click();
  }

  async scrollToTop() {
    await this.scrollContainer.evaluate((el) => {
      el.scrollTo({ top: 0, behavior: "instant" });
    });
  }

  async scrollToBottom() {
    await this.scrollContainer.evaluate((el) => {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    });
  }

  async scrollToPosition(top: number) {
    await this.scrollContainer.evaluate(
      (el, scrollTop) => {
        el.scrollTo({ top: scrollTop, behavior: "instant" });
      },
      top
    );
  }

  async getScrollTop(): Promise<number> {
    return await this.scrollContainer.evaluate((el) => el.scrollTop);
  }

  async getScrollHeight(): Promise<number> {
    return await this.scrollContainer.evaluate((el) => el.scrollHeight);
  }

  async getClientHeight(): Promise<number> {
    return await this.scrollContainer.evaluate((el) => el.clientHeight);
  }

  async isUserMessageInViewport(index: number): Promise<boolean> {
    const userMessages = this.container.locator('[data-role="user"]');
    const message = userMessages.nth(index);

    return await message.evaluate((el) => {
      const container = el.closest(".overflow-y-auto");
      if (!container) return false;

      const containerRect = container.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();

      return (
        elementRect.top >= containerRect.top &&
        elementRect.bottom <= containerRect.bottom
      );
    });
  }

  async getUserMessageScrollPosition(index: number): Promise<number> {
    const userMessages = this.container.locator('[data-role="user"]');
    const message = userMessages.nth(index);

    return await message.evaluate((el) => {
      const container = el.closest(".overflow-y-auto");
      if (!container) return 0;

      const containerRect = container.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();
      return elementRect.top - containerRect.top + container.scrollTop;
    });
  }
}

