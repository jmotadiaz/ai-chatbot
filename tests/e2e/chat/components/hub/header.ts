import { Locator } from "@playwright/test";

export class HubHeaderComponent {
  readonly container: Locator;
  readonly modelPicker: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.modelPicker = container.getByRole("combobox");
  }

  async addModel(modelName: string) {
    // The "New Model" can be a button or part of the combobox
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
