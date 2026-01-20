import { Locator } from "@playwright/test";

/**
 * Component Object Model for Project List in Sidebar
 * Manages projects list interactions
 */
export class ProjectListComponent {
  readonly container: Locator;
  readonly projectList: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.projectList = container.getByRole("list");
  }

  getProjectItemByTitle(title: string): Locator {
    return this.projectList.getByRole("button").filter({ hasText: title });
  }

  async expandProject(title: string) {
    const item = this.getProjectItemByTitle(title);
    await item.click();
  }

  async clickStartChat(title: string) {
    await this.expandProject(title);
    await this.projectList
      .locator("button:has(svg.lucide-message-circle)")
      .first()
      .click();
  }

  async clickTemporaryChat(title: string) {
    await this.expandProject(title);
    await this.projectList
      .locator("button:has(svg.lucide-message-circle-dashed)")
      .first()
      .click();
  }

  async clickEdit(title: string) {
    await this.expandProject(title);
    await this.projectList
      .locator("button:has(svg.lucide-pencil)")
      .first()
      .click();
  }

  async clickDelete(title: string) {
    await this.expandProject(title);
    await this.projectList
      .locator("button:has(svg.lucide-trash)")
      .first()
      .click();
  }
}
