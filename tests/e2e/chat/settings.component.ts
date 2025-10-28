import { Locator } from "@playwright/test";

/**
 * Component Object Model for Chat Settings functionality
 * Encapsulates chat settings interactions and elements
 */
export class SettingsComponent {
  readonly container: Locator;
  readonly temperatureInput: Locator;
  readonly ragSimilarityInput: Locator;
  readonly ragMaxResourcesInput: Locator;
  readonly webSearchNumResultsInput: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.temperatureInput = container.getByLabel("Temperature");
    this.ragSimilarityInput = container.getByLabel("RAG Similarity %");
    this.ragMaxResourcesInput = container.getByLabel("RAG Max Resources");
    this.webSearchNumResultsInput = container.getByLabel("Web Search Results");
  }

  async setTemperature(value: number) {
    await this.temperatureInput.fill(value.toString());
  }

  async setRagSimilarity(value: number) {
    await this.ragSimilarityInput.fill(value.toString());
  }

  async setRagMaxResources(value: number) {
    await this.ragMaxResourcesInput.fill(value.toString());
  }

  async setWebSearchNumResults(value: number) {
    await this.webSearchNumResultsInput.fill(value.toString());
  }
}
