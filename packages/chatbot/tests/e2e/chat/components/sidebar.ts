import { Locator } from "@playwright/test";
import { ConfirmModalComponent } from "./confirm-modal";

/**
 * Component Object Model for Sidebar functionality
 * Encapsulates sidebar interactions and elements
 */
export class SidebarComponent {
  readonly container: Locator;
  // Sidebar elements
  readonly chatList: Locator;
  readonly projectList: Locator;
  readonly addProjectButton: Locator;
  readonly confirmModal: ConfirmModalComponent;

  constructor(container: Locator) {
    this.container = container;

    this.chatList = container.getByRole("list", { name: "Chat history" });
    this.projectList = container.getByRole("list", { name: "Projects" });
    this.addProjectButton = container.getByRole("link", { name: "Projects" });
    this.confirmModal = new ConfirmModalComponent(container);
  }

  /**
   * Get all chat titles from the sidebar
   */
  getChatItemByTitle(title: string): Locator {
    // Use .first() because sidebar creates animation clones with opacity-0
    return this.chatList
      .getByRole("listitem")
      .filter({ hasText: title })
      .first();
  }

  /**
   * Delete a chat by its title
   * @param title The title of the chat to delete
   */
  async deleteChat(title: string) {
    await this.getChatItemByTitle(title).getByLabel("Delete chat").click();
  }

  /**
   * Click on a chat in the sidebar by its title
   * @param title The title of the chat to click
   */
  async clickChatByTitle(title: string) {
    await this.chatList.getByText(title, { exact: true }).click();
  }

  /**
   * Get a project item in the sidebar by its title
   * @param title The title of the project
   */
  getProjectItemByTitle(title: string): Locator {
    return this.container
      .getByTestId("project-item-toggle")
      .filter({ hasText: title })
      .first();
  }

  /**
   * Click a specific action for a project
   * @param title The title of the project
   * @param action The action to perform ('chat', 'temporary-chat', 'edit', 'delete')
   */
  async navigateProjectAction(
    title: string,
    action: "chat" | "temporary-chat" | "edit" | "delete",
  ) {
    const projectItem = this.getProjectItemByTitle(title);

    // Check if it's already expanded
    const isExpanded = await projectItem.getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await projectItem.click();
    }

    // Wait for the panel to be visible to avoid interception/stability issues
    const ariaControls = await projectItem.getAttribute("aria-controls");
    const panel = this.container.page().locator(`#${ariaControls}`);
    await panel.waitFor({ state: "visible" });

    switch (action) {
      case "chat":
        await panel.getByLabel("Chat").first().click();
        break;
      case "temporary-chat":
        await panel.getByLabel("Temporary Chat").first().click();
        break;
      case "edit":
        await panel.getByLabel("Edit project").first().click();
        break;
      case "delete":
        await panel.getByLabel("Delete project").first().click();
        break;
    }
  }

  /**
   * Click the 'Add New Project' button (+)
   */
  async clickAddProject() {
    await this.addProjectButton.click();
  }
}
