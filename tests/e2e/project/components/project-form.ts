import { Locator, Page } from "@playwright/test";

/**
 * Component Object Model for Project Form
 * Handles project configuration form elements
 */
export class ProjectFormComponent {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly modelSelect: Locator;
  readonly promptEditor: Locator;
  readonly ragCheckbox: Locator;
  readonly webSearchCheckbox: Locator;
  readonly refinePromptCheckbox: Locator;
  readonly advancedSection: Locator;
  readonly temperatureInput: Locator;
  readonly ragMaxResourcesInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.getByRole("textbox", { name: "Title" });
    this.modelSelect = page.getByRole("combobox");
    this.promptEditor = page.locator("textarea");
    this.ragCheckbox = page.getByLabel("RAG");
    this.webSearchCheckbox = page.getByLabel("Web Search");
    this.refinePromptCheckbox = page.getByLabel("Refine Prompt");
    this.advancedSection = page.getByRole("button", { name: "Advanced" });
    this.temperatureInput = page.getByRole("spinbutton", {
      name: "Temperature",
    });
    this.ragMaxResourcesInput = page.getByLabel("RAG Max Resources");
    this.saveButton = page.getByRole("button", { name: "Save Project" });
  }

  async fillTitle(title: string) {
    await this.titleInput.fill(title);
  }

  async selectModel(model: string) {
    await this.modelSelect.click();
    await this.page.getByRole("option", { name: new RegExp(model) }).click();
  }

  async fillPrompt(prompt: string) {
    await this.promptEditor.fill(prompt);
  }

  async toggleTool(tool: "rag" | "web-search" | "refine-prompt") {
    const checkbox =
      tool === "rag"
        ? this.ragCheckbox
        : tool === "web-search"
          ? this.webSearchCheckbox
          : this.refinePromptCheckbox;
    await checkbox.click({ force: true });
  }

  async expandAdvanced() {
    await this.advancedSection.click();
  }

  async setTemperature(temp: number) {
    await this.temperatureInput.fill(temp.toString());
  }

  async setRagMaxResources(resources: number) {
    await this.ragMaxResourcesInput.fill(resources.toString());
  }

  async save() {
    await this.saveButton.click();
  }
}
