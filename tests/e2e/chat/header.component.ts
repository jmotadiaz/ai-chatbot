import { Page, Locator } from "@playwright/test";
import type { chatModelId } from "@/lib/ai/models/definition";

/**
 * Page Object Model for Chat functionality
 * Encapsulates chat page interactions and elements
 */
export class HeaderComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly modelPicker: Locator;
  readonly modelDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator("header");

    this.modelPicker = this.container.locator(
      '[role="combobox"][aria-controls="dropdown-header-model-picker"]'
    );
    this.modelDropdown = this.container.locator(
      "#dropdown-header-model-picker"
    );
  }

  getModelOption(modelName: chatModelId): Locator {
    return this.modelDropdown.getByRole("option", {
      name: modelName,
    });
  }

  async openSelectModelDropdown() {
    await this.modelPicker.click();
  }

  async selectModel(modelName: chatModelId) {
    await this.openSelectModelDropdown();
    await this.getModelOption(modelName).click();
    await this.modelDropdown.waitFor({ state: "detached" });
  }
}
