import { Locator } from "@playwright/test";

/**
 * Component Object Model for Chat Settings functionality
 * Encapsulates chat settings interactions and elements
 */
export class SettingsComponent {
  readonly container: Locator;
  readonly temperatureInput: Locator;

  readonly webSearchNumResultsInput: Locator;
  readonly ragMaxResourcesInput: Locator;
  readonly minRagResourcesScoreInput: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.temperatureInput = container.getByLabel("Temperature");

    this.webSearchNumResultsInput = container.getByLabel("Web Search Results");
    this.ragMaxResourcesInput = container.getByLabel("Max RAG Resources");
    this.minRagResourcesScoreInput = container.getByLabel("Min RAG Score");
  }

  async setTemperature(value: number) {
    await this.temperatureInput.fill(value.toString());
  }

  async setWebSearchNumResults(value: number) {
    await this.webSearchNumResultsInput.fill(value.toString());
  }

  async setRagMaxResources(value: number) {
    await this.ragMaxResourcesInput.fill(value.toString());
  }

  async setMinRagResourcesScore(value: number) {
    await this.minRagResourcesScoreInput.fill(value.toString());
  }
}
