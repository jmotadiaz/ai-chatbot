import { Locator } from "@playwright/test";

export class HubHeaderComponent {
  readonly container: Locator;
  readonly modelPicker: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.modelPicker = container.getByRole("combobox");
  }

  async addModel(modelName: string) {
    await this.modelPicker.click();
    await this.container
      .page()
      .getByRole("option", { name: modelName })
      .first()
      .click();
  }

  async selectTab(name: string) {
    await this.container.getByRole("button", { name, exact: true }).click();
  }
}
