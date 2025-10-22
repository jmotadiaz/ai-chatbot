import { Locator } from "@playwright/test";
import type { chatModelId } from "@/lib/ai/models/definition";

/**
 * Component Object Model for Header functionality
 * Encapsulates header interactions and elements
 */
export class HeaderComponent {
  readonly container: Locator;
  readonly modelPicker: Locator;
  readonly modelDropdown: Locator;
  readonly sidebarToggleButton: Locator;

  constructor(container: Locator) {
    this.container = container;

    this.modelPicker = container.locator(
      '[role="combobox"][aria-controls="dropdown-header-model-picker"]'
    );
    this.modelDropdown = container.locator("#dropdown-header-model-picker");
    this.sidebarToggleButton = container.getByLabel("Toggle sidebar");
  }

  async toggleSidebar() {
    await this.sidebarToggleButton.click();
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
