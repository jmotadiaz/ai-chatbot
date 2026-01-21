import { Locator } from "@playwright/test";
import { ModelPickerComponent } from "@/tests/e2e/chat/components/model-picker";

/**
 * Component Object Model for Header functionality
 * Encapsulates header interactions and elements
 */
export class HeaderComponent {
  readonly container: Locator;
  readonly sidebarToggleButton: Locator;
  readonly modelPicker: ModelPickerComponent;

  constructor(container: Locator) {
    this.container = container;

    this.modelPicker = new ModelPickerComponent(
      container,
      "header-model-picker"
    );
    // The toggle is rendered as a div with an aria-label; use a locator that targets the attribute
    this.sidebarToggleButton = container.locator('[aria-label="Toggle sidebar"]').first();
  }

  async toggleSidebar() {
    await this.sidebarToggleButton.click();
  }
}
