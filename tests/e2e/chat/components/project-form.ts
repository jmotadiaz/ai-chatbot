import { Locator, expect } from "@playwright/test";
import { NumericSelectorComponent } from "./numeric-selector";

/**
 * Component Object Model for Project Form
 */
export class ProjectFormComponent {
  readonly container: Locator;
  readonly titleInput: Locator;
  readonly modelSelect: Locator;
  readonly systemPromptInput: Locator;
  readonly ragToggle: Locator;
  readonly refinePromptToggle: Locator;
  readonly advancedAccordion: Locator;
  readonly temperatureSelector: NumericSelectorComponent;
  readonly saveButton: Locator;

  constructor(container: Locator) {
    this.container = container;
    const page = container.page();

    // Prefer accessible name or data-testid if available; fall back to IDs
    this.titleInput = page.getByLabel("Title").or(page.locator("#title"));
    this.modelSelect = page
      .getByTestId("project-form-model-picker")
      .or(page.locator("#project-form-model-picker"));
    this.systemPromptInput = page
      .getByRole("textbox")
      .or(page.locator(".w-md-editor-text-input, textarea, [role='textbox']"))
      .last();

    this.ragToggle = page.locator("#rag-tool");
    this.refinePromptToggle = page.locator("#refine-prompt");

    this.advancedAccordion = page
      .getByTestId("collapsible-toggle")
      .filter({ hasText: "Advanced" });

    // Scoped selectors for numeric inputs based on their IDs
    this.temperatureSelector = new NumericSelectorComponent(
      page.getByTestId("input-number-temperature"),
    );

    // Some locales or UI changes may alter the button text; also accept testid
    this.saveButton = page
      .getByRole("button", { name: "Save Project" })
      .or(page.getByTestId("save-project-button"));
  }

  async fillBasic(title: string, prompt: string) {
    await this.titleInput.fill(title);
    await this.systemPromptInput.click();
    await this.systemPromptInput.fill(prompt);
  }

  async toggleRag(on: boolean) {
    const isChecked = await this.ragToggle.isChecked();
    if (isChecked !== on) {
      await this.container.page().locator('label[for="rag-tool"]').click();
      await this.ragToggle
        .page()
        .waitForFunction(
          (id) =>
            (document.getElementById(id) as HTMLInputElement).checked === true,
          "rag-tool",
          { timeout: 5000 },
        )
        .catch(() => {});
    }
  }

  async toggleRefinePrompt(on: boolean) {
    const isChecked = await this.refinePromptToggle.isChecked();
    if (isChecked !== on) {
      await this.container.page().locator('label[for="refine-prompt"]').click();
      await this.refinePromptToggle
        .page()
        .waitForFunction(
          (id) =>
            (document.getElementById(id) as HTMLInputElement).checked === true,
          "refine-prompt",
          { timeout: 5000 },
        )
        .catch(() => {});
    }
  }

  async expandAdvanced() {
    const isExpanded =
      (await this.advancedAccordion.getAttribute("aria-expanded")) === "true";
    if (!isExpanded) {
      await this.advancedAccordion.click();
    }
    // Wait for internal content to settle after expansion
    await this.temperatureSelector.container.waitFor({ state: "visible" });
  }

  async save() {
    await this.saveButton.waitFor({ state: "visible" });
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.evaluate((e) => (e as HTMLElement).click());
  }
}
