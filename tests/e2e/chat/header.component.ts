import { Locator } from "@playwright/test";
import { ModelPickerComponent } from "@/tests/e2e/chat/model-picker.component";

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
    this.sidebarToggleButton = container.getByLabel("Toggle sidebar");
  }

  async toggleSidebar() {
    await this.sidebarToggleButton.click();
  }
}
