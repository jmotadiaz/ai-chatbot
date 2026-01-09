import { Locator, expect } from "@playwright/test";

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

  readonly wrapper: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.wrapper = container.getByTestId("chat-navigation-wrapper");
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
    await this.scrollContainer.evaluate((el, scrollTop) => {
      el.scrollTo({ top: scrollTop, behavior: "instant" });
    }, top);
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

  async assertPrevButtonVisible() {
    // Simply wait for the button to become visible with extended timeout
    await expect(this.prevButton).toBeVisible({ timeout: 15000 });
  }

  async assertPrevButtonHidden() {
    await expect(this.prevButton).not.toBeVisible({ timeout: 5000 });
  }

  async assertNextButtonVisible() {
    // Simply wait for the button to become visible with extended timeout
    await expect(this.nextButton).toBeVisible({ timeout: 15000 });
  }

  async assertNextButtonHidden() {
    await expect(this.nextButton).not.toBeVisible({ timeout: 5000 });
  }

  async assertBottomButtonVisible() {
    // Simply wait for the button to become visible with extended timeout
    await expect(this.bottomButton).toBeVisible({ timeout: 15000 });
  }

  async assertBottomButtonHidden() {
    await expect(this.bottomButton).not.toBeVisible({ timeout: 5000 });
  }

  async waitForMessageInViewport(
    index: number,
    shouldBeVisible: boolean = true
  ) {
    await expect
      .poll(
        async () => {
          return await this.isUserMessageInViewport(index);
        },
        {
          timeout: 5000,
        }
      )
      .toBe(shouldBeVisible);
  }

  async assertScrollTopLessThan(value: number) {
    await expect
      .poll(
        async () => {
          return await this.getScrollTop();
        },
        {
          timeout: 5000,
        }
      )
      .toBeLessThan(value);
  }

  async assertScrollTopGreaterThan(value: number) {
    await expect
      .poll(
        async () => {
          return await this.getScrollTop();
        },
        {
          timeout: 5000,
        }
      )
      .toBeGreaterThan(value);
  }

  async assertDistanceFromBottomLessThan(value: number) {
    await expect
      .poll(
        async () => {
          const scrollTop = await this.getScrollTop();
          const scrollHeight = await this.getScrollHeight();
          const clientHeight = await this.getClientHeight();
          return scrollHeight - scrollTop - clientHeight;
        },
        {
          timeout: 5000,
        }
      )
      .toBeLessThan(value);
  }
}
