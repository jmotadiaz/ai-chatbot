import { Locator } from "@playwright/test";

/**
 * Component Object Model for Tools functionality
 * Encapsulates tools configuration interactions and elements
 */
export class ToolsComponent {
  readonly container: Locator;
  readonly ragToolLabel: Locator;
  readonly webSearchToolLabel: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.ragToolLabel = container.locator('label[for="rag-tool"]');
    this.webSearchToolLabel = container.locator('label[for="web-search-tool"]');
  }

  async toggleTool(toolName: "rag" | "web-search") {
    if (toolName === "rag") {
      return await this.ragToolLabel.click();
    } else if (toolName === "web-search") {
      return await this.webSearchToolLabel.click();
    }
  }
}
