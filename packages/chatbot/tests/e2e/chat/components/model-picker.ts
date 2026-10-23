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
    // Each option's accessible name ends in a pricing suffix
    // ("basicChat I: | O: |"), so exact does NOT work: we anchor ^ on the id
    // (the suffix contains the I/O). With a plain substring, an id that prefixes
    // another (basicChat ↔ basicChatAlt) would resolve 2 elements in strict mode.
    const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.modelDropdown.getByRole("option", {
      name: new RegExp(`^${escaped}\\s+I:`),
    });
  }

  async openSelectModelDropdown() {
    await this.modelPicker.click();
  }

  // The picker's ids are those of the catalog the Mock Model Gateway serves
  // (capabilities: basicChat, canExecuteTools, …) — no intermediate aliases.
  async selectModel(modelName: string) {
    await this.openSelectModelDropdown();
    await this.getModelOption(modelName).click();
    await this.modelDropdown.waitFor({ state: "detached" });
  }
}
