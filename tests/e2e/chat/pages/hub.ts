import { Page } from "@playwright/test";
import { SidebarComponent } from "../components/sidebar";
import { HubHeaderComponent } from "../components/hub/header";
import { HubContentComponent } from "../components/hub/content";
import { HubPanelComponent } from "../components/hub/panel";

export class ChatHubPage {
  readonly page: Page;
  readonly header: HubHeaderComponent;
  readonly sidebar: SidebarComponent;
  readonly hubContent: HubContentComponent;

  constructor(page: Page) {
    this.page = page;
    this.header = new HubHeaderComponent(page.locator("body"));
    this.sidebar = new SidebarComponent(
      page.getByTestId("sidebar-container").first(),
    );
    this.hubContent = new HubContentComponent(page.locator("main").first());
  }

  async goto() {
    await this.page.goto("/chat/hub");
  }

  async isTabMode(): Promise<boolean> {
    // Heuristic: when the hub renders a top tab bar, it typically includes a "New Model" button.
    // In grid mode, the add-model UI is usually a combobox and the "New Model" button is absent.
    return await this.page
      .getByRole("button", { name: "New Model" })
      .isVisible();
  }

  getPanel(modelName: string): HubPanelComponent {
    return new HubPanelComponent(
      this.page
        .locator('[data-testid="hub-instance-panel"]:visible')
        .filter({ hasText: modelName })
        .first(),
    );
  }
}
