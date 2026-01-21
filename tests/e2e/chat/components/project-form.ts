import { Locator } from "@playwright/test";
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
  readonly webSearchToggle: Locator;
  readonly refinePromptToggle: Locator;
  readonly advancedAccordion: Locator;
  readonly temperatureSelector: NumericSelectorComponent;
  readonly webSearchResultsSelector: NumericSelectorComponent;
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
    this.webSearchToggle = page.locator("#web-search-tool");
    this.refinePromptToggle = page.locator("#refine-prompt");

    this.advancedAccordion = page
      .getByTestId("collapsible-toggle")
      .filter({ hasText: "Advanced" });

    // Scoped selectors for numeric inputs based on their IDs
    this.temperatureSelector = new NumericSelectorComponent(
      page.getByTestId("input-number-temperature"),
    );
    this.webSearchResultsSelector = new NumericSelectorComponent(
      page.getByTestId("input-number-webSearchNumResults"),
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

  async toggleWebSearch(on: boolean) {
    const isChecked = await this.webSearchToggle.isChecked();
    if (isChecked !== on) {
      // Click the label associated with the checkbox
      await this.container
        .page()
        .locator('label[for="web-search-tool"]')
        .click();
      // Wait for the state to update
      await this.webSearchToggle
        .page()
        .waitForFunction(
          (id) =>
            (document.getElementById(id) as HTMLInputElement).checked === true,
          "web-search-tool",
          { timeout: 5000 },
        )
        .catch(() => {}); // Ignore timeout, we'll see if it works
    }
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
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click({ force: true });
  }
}
