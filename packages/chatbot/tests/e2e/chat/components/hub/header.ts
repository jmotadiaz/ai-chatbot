import { Locator } from "@playwright/test";
import { CAPABILITY_ALIASES } from "@/tests/mocks/ai/capabilities";
import type { CapabilityAlias } from "@/tests/mocks/ai/capabilities";

export class HubHeaderComponent {
  readonly container: Locator;
  readonly modelPicker: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.modelPicker = container.getByRole("combobox");
  }

  async addModel(modelNameOrCapability: string | CapabilityAlias) {
    const modelName =
      CAPABILITY_ALIASES[modelNameOrCapability as CapabilityAlias] ??
      modelNameOrCapability;
    const newModelButton = this.container.getByRole("button", {
      name: "New Model",
    });
    if (await newModelButton.isVisible()) {
      await newModelButton.click();
    } else {
      await this.modelPicker.click();
    }
    await this.container
      .page()
      .getByRole("option", { name: modelName })
      .first()
      .click();
  }

  async selectTab(name: string) {
    const tabButton = this.container.getByRole("button", { name, exact: true });
    if (await tabButton.isVisible()) {
      await tabButton.click();
    }
  }
}
