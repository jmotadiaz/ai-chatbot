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

  async scrollToMessage(text: string) {
    const message = this.container
      .locator('[data-role="user"]')
      .filter({ hasText: text });

    // Ensure the message is attached and visible before attempting to scroll
    await message.waitFor({ state: "attached", timeout: 5000 });

    // scrollIntoViewIfNeeded is usually reliable, but if the element is detached
    // during the process (e.g. React re-render), we try once more after a small wait
    try {
      await message.scrollIntoViewIfNeeded();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Element is not attached to the DOM")
      ) {
        await this.scrollContainer.page().waitForTimeout(100);
        await message.scrollIntoViewIfNeeded();
      } else {
        throw error;
      }
    }
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

  async isUserMessageInViewport(text: string): Promise<boolean> {
    const message = this.container
      .locator('[data-role="user"]')
      .filter({ hasText: text });

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

  /**
   * Assert that a user message is in the viewport using native Playwright assertion.
   * Uses toPass for retry logic to handle scroll animation timing.
   */
  async assertUserMessageInViewport(text: string) {
    const message = this.container
      .locator('[data-role="user"]')
      .filter({ hasText: text });
    await expect(async () => {
      await expect(message).toBeInViewport();
    }).toPass({
      intervals: [500, 1_000, 2_000],
      timeout: 10_000,
    });
  }

  /**
   * Assert that a user message is NOT in the viewport using native Playwright assertion.
   */
  async assertUserMessageNotInViewport(text: string) {
    const message = this.container
      .locator('[data-role="user"]')
      .filter({ hasText: text });
    await expect(message).not.toBeInViewport();
  }

  async getUserMessageScrollPosition(text: string): Promise<number> {
    const message = this.container
      .locator('[data-role="user"]')
      .filter({ hasText: text });

    return await message.evaluate((el) => {
      const container = el.closest(".overflow-y-auto");
      if (!container) return 0;

      const containerRect = container.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();
      return elementRect.top - containerRect.top + container.scrollTop;
    });
  }

  async assertPrevButtonVisible() {
    await expect(async () => {
      await expect(this.prevButton).toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertPrevButtonHidden() {
    await expect(async () => {
      await expect(this.prevButton).not.toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertNextButtonVisible() {
    await expect(async () => {
      await expect(this.nextButton).toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertNextButtonHidden() {
    await expect(async () => {
      await expect(this.nextButton).not.toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertBottomButtonVisible() {
    await expect(async () => {
      await expect(this.bottomButton).toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertBottomButtonHidden() {
    await expect(async () => {
      await expect(this.bottomButton).not.toBeVisible();
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async waitForMessageInViewport(
    text: string,
    shouldBeVisible: boolean = true,
  ) {
    await expect(async () => {
      const isVisible = await this.isUserMessageInViewport(text);
      expect(isVisible).toBe(shouldBeVisible);
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertScrollTopLessThan(value: number) {
    await expect(async () => {
      await this.scrollToTop();
      const scrollTop = await this.getScrollTop();
      expect(scrollTop).toBeLessThan(value);
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertScrollTopGreaterThan(value: number) {
    await expect(async () => {
      const scrollTop = await this.getScrollTop();
      expect(scrollTop).toBeGreaterThan(value);
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }

  async assertDistanceFromBottomLessThan(value: number) {
    await expect(async () => {
      const scrollTop = await this.getScrollTop();
      const scrollHeight = await this.getScrollHeight();
      const clientHeight = await this.getClientHeight();
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      expect(distanceFromBottom).toBeLessThan(value);
    }).toPass({
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 30_000,
    });
  }
}
