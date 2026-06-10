import { Locator } from "@playwright/test";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { CAPABILITY_ALIASES } from "@/tests/mocks/ai/capabilities";
import type { CapabilityAlias } from "@/tests/mocks/ai/capabilities";

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

  async selectModel(modelNameOrCapability: chatModelId | CapabilityAlias) {
    const modelName =
      CAPABILITY_ALIASES[modelNameOrCapability as CapabilityAlias] ??
      modelNameOrCapability;
    await this.openSelectModelDropdown();
    await this.getModelOption(modelName).click();
    await this.modelDropdown.waitFor({ state: "detached" });
  }
}
