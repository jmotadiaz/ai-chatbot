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
    // El accessible name de cada option acaba en un sufijo de precios
    // ("basicChat I: | O: |"), así que NO vale exact: pinsam en ancla ^ sobre
    // el id (el sufijo contiene la I/O). Con subcadena plana, un id prefijo de
    // otro (basicChat ↔ basicChatAlt) resolvería 2 elementos en modo estricto.
    const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.modelDropdown.getByRole("option", {
      name: new RegExp(`^${escaped}\\s+I:`),
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
