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

  getPanel(modelName: string): HubPanelComponent {
    return new HubPanelComponent(
      this.page
        .getByTestId("hub-instance-panel")
        .filter({ hasText: modelName }),
    );
  }
}
