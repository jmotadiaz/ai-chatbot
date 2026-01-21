import { Locator } from "@playwright/test";

/**
 * Component Object Model for Numeric Selector (e.g., Temperature, results count)
 */
export class NumericSelectorComponent {
  readonly container: Locator;
  readonly incrementButton: Locator;
  readonly decrementButton: Locator;
  readonly valueDisplay: Locator;

  constructor(container: Locator) {
    this.container = container;
    // Precisely locate buttons by their aria-labels within the container
    this.decrementButton = container.locator(
      'button[aria-label="Decrease value"]',
    );
    this.incrementButton = container.locator(
      'button[aria-label="Increase value"]',
    );
    // Value is in the numeric input
    this.valueDisplay = container.getByRole("spinbutton");
  }

  async increment() {
    await this.incrementButton.waitFor({ state: "visible", timeout: 10000 });
    await this.incrementButton.scrollIntoViewIfNeeded();
    await this.incrementButton.click();
  }

  async decrement() {
    await this.decrementButton.waitFor({ state: "visible", timeout: 10000 });
    await this.decrementButton.scrollIntoViewIfNeeded();
    await this.decrementButton.click();
  }

  async getValue(): Promise<string> {
    return await this.valueDisplay.inputValue();
  }
}
