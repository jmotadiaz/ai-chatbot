import { Page } from "@playwright/test";
import { SidebarComponent } from "../components/sidebar";
import { HeaderComponent } from "../components/header";
import { ProjectFormComponent } from "../components/project-form";
import { ChatComponent } from "../components/chat";

/**
 * Page Object Model for Project creation and editing
 */
export class ProjectPage {
  readonly page: Page;
  readonly header: HeaderComponent;
  readonly sidebar: SidebarComponent;
  readonly form: ProjectFormComponent;
  readonly testChat: ChatComponent;

  constructor(page: Page) {
    this.page = page;
    this.header = new HeaderComponent(
      page.getByTestId("header-container").first(),
    );
    this.sidebar = new SidebarComponent(
      page.getByTestId("sidebar-container").first(),
    );
    // There is no semantic <form> tag, using the configuration panel div
    this.form = new ProjectFormComponent(
      page
        .getByRole("region", { name: "Configuration" })
        .or(page.locator("div.flex.flex-col.gap-6").first()),
    );
    this.testChat = new ChatComponent(
      page.getByTestId("chat-container").first(),
    );
  }

  async gotoAdd() {
    await this.page.goto("/project/add");
    // Wait for the main tabs to be visible
    await this.page
      .getByRole("button", { name: "Configuration" })
      .first()
      .waitFor({
        state: "visible",
        timeout: 10000,
      });
  }

  async gotoEdit(projectId: string) {
    await this.page.goto(`/project/${projectId}/edit`);
    // Wait for the main tabs to be visible
    await this.page
      .getByRole("button", { name: "Configuration" })
      .first()
      .waitFor({
        state: "visible",
        timeout: 10000,
      });
  }

  async switchToTab(tab: "configuration" | "testChat") {
    const label = tab === "configuration" ? "Configuration" : "Test Chat";
    const btn = this.page.getByRole("button", { name: label }).first();
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
  }

  async ensureSidebarOpen() {
    try {
      // Ensure header exists before toggling
      await this.page.getByTestId("header-container").first().waitFor({
        state: "visible",
        timeout: 5000,
      });
      const isVisible = await this.sidebar.container.isVisible();
      if (!isVisible) {
        await this.header.toggleSidebar();
      }
    } catch {
      // If header doesn't appear, skip toggling to avoid hard failures
    }
  }

  async ensureSidebarClosed() {
    const isVisible = await this.sidebar.container.isVisible();
    if (isVisible) {
      await this.header.toggleSidebar();
    }
  }
}
