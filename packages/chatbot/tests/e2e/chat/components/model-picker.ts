import { Locator } from "@playwright/test";

/**
 * Component Object Model for Header functionality
 * Encapsulates header interactions and elements
 */
export class ModelPickerComponent {
  readonly modelPicker: Locator;
  readonly modelDropdown: Locator;

  constructor(container: Locator, id: string) {
    this.modelPicker = container
      .locator(`[role="combobox"][aria-controls="dropdown-${id}"]`)
      .first();
    this.modelDropdown = container.locator(`#dropdown-${id}`);
  }

  getModelOption(modelName: string): Locator {
    return this.modelDropdown.getByRole("option", {
      name: modelName,
    });
  }

  async openSelectModelDropdown() {
    await this.modelPicker.click();
  }

  // Los ids del picker son los del catálogo que sirve el Mock Model Gateway
  // (capacidades: basicChat, canExecuteTools, …) — sin alias intermedios.
  async selectModel(modelName: string) {
    await this.openSelectModelDropdown();
    await this.getModelOption(modelName).click();
    await this.modelDropdown.waitFor({ state: "detached" });
  }
}
