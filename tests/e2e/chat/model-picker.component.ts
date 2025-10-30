import { Locator } from "@playwright/test";
import type { chatModelId } from "@/lib/ai/models/definition";

/**
 * Component Object Model for Header functionality
 * Encapsulates header interactions and elements
 */
export class ModelPickerComponent {
  readonly modelPicker: Locator;
  readonly modelDropdown: Locator;

  constructor(container: Locator, id: string) {
    this.modelPicker = container.locator(
      `[role="combobox"][aria-controls="dropdown-${id}"]`
    );
    this.modelDropdown = container.locator(`#dropdown-${id}`);
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
