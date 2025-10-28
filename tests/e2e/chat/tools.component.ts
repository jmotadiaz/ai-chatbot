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

  async toggleTool(toolName: "rag" | "web-search", dropdownBackdrop: Locator) {
    if (toolName === "rag") {
      await this.ragToolLabel.click();
    } else if (toolName === "web-search") {
      await this.webSearchToolLabel.click();
    }
    await dropdownBackdrop.click({ position: { x: 10, y: 10 } });
  }
}
